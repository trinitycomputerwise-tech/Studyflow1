
const crypto = require("crypto");

const headers = (secretKey) => ({
  apikey: secretKey,
  Authorization: `Bearer ${secretKey}`,
  "Content-Type": "application/json"
});

exports.handler = async (event) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: corsHeaders, body: "" };
  }

  const respond = (statusCode, data) => ({
    statusCode,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });

  const updatePayment = async (supabaseUrl, dbHeaders, payment, changes) => {
    const updateUrl = new URL(`${supabaseUrl}/rest/v1/tutoring_payments`);
    updateUrl.searchParams.set("id", `eq.${payment.id}`);
    updateUrl.searchParams.set("status", "eq.Pending");

    const response = await fetch(updateUrl, {
      method: "PATCH",
      headers: {
        ...dbHeaders,
        Prefer: "return=representation"
      },
      body: JSON.stringify(changes)
    });

    if (!response.ok) {
      throw new Error("Could not update the previous payment record");
    }

    return response.json();
  };

  const verifyPreviousPayment = async (payment, paystackKey) => {
    const response = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(payment.reference)}`,
      {
        headers: {
          Authorization: `Bearer ${paystackKey}`,
          "Content-Type": "application/json"
        }
      }
    );

    const result = await response.json();

    if (!response.ok || !result.status || !result.data) {
      throw new Error("Could not confirm the previous payment status. Please try again shortly.");
    }

    const transaction = result.data;
    const metadata = transaction.metadata || {};

    if (
      transaction.reference !== payment.reference ||
      Number(transaction.amount) !== Math.round(Number(payment.amount_ngn) * 100) ||
      transaction.currency !== "NGN" ||
      String(metadata.request_id) !== String(payment.request_id) ||
      String(metadata.student_id) !== String(payment.student_id) ||
      String(metadata.tutor_id) !== String(payment.tutor_id)
    ) {
      throw new Error("Previous payment details could not be verified. Please contact support.");
    }

    return transaction.status;
  };

  try {
    if (event.httpMethod !== "POST") {
      return respond(405, { error: "Method not allowed" });
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const paystackKey = process.env.PAYSTACK_SECRET_KEY;

    if (!supabaseUrl || !supabaseKey || !paystackKey) {
      return respond(500, { error: "Payment service is not configured" });
    }

    const accessToken = (event.headers?.authorization || "")
      .replace(/^Bearer\s+/i, "");

    if (!accessToken) {
      return respond(401, { error: "Please sign in first" });
    }

    const authResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${accessToken}`
      }
    });

    if (!authResponse.ok) {
      return respond(401, {
        error: "Your login session is invalid. Please sign in again."
      });
    }

    const student = await authResponse.json();
    const { requestId } = JSON.parse(event.body || "{}");

    if (!requestId) {
      return respond(400, { error: "A tutoring request ID is required" });
    }

    const dbHeaders = headers(supabaseKey);

    const requestUrl = new URL(`${supabaseUrl}/rest/v1/tutoring_requests`);
    requestUrl.searchParams.set("id", `eq.${requestId}`);
    requestUrl.searchParams.set("select", "id,student_id,tutor_id,status");

    const requestResponse = await fetch(requestUrl, { headers: dbHeaders });

    if (!requestResponse.ok) {
      throw new Error("Could not check the tutoring request");
    }

    const requests = await requestResponse.json();
    const request = requests[0];

    if (!request || request.student_id !== student.id) {
      return respond(404, { error: "Tutoring request not found" });
    }

    if (request.status !== "Approved") {
      return respond(400, {
        error: "The tutor must approve this request before payment"
      });
    }

    // Check every previous attempt before starting another checkout.
    const previousUrl = new URL(`${supabaseUrl}/rest/v1/tutoring_payments`);
    previousUrl.searchParams.set("request_id", `eq.${request.id}`);
    previousUrl.searchParams.set("student_id", `eq.${student.id}`);
    previousUrl.searchParams.set(
      "select",
      "id,request_id,student_id,tutor_id,amount_ngn,reference,status"
    );
    previousUrl.searchParams.set("order", "created_at.desc");

    const previousResponse = await fetch(previousUrl, {
      headers: dbHeaders
    });

    if (!previousResponse.ok) {
      throw new Error("Could not check previous payment attempts");
    }

    const previousPayments = await previousResponse.json();

    if (previousPayments.some(payment => payment.status === "Paid")) {
      return respond(409, {
        error: "This session has already been paid for. Please refresh the page."
      });
    }

    for (const payment of previousPayments) {
      if (payment.status !== "Pending") continue;

      const previousStatus = await verifyPreviousPayment(payment, paystackKey);

      if (previousStatus === "success") {
        const updated = await updatePayment(
          supabaseUrl,
          dbHeaders,
          payment,
          {
            status: "Paid",
            paid_at: new Date().toISOString()
          }
        );

        if (!updated.length) {
          return respond(409, {
            error: "Payment status changed. Please refresh and check again."
          });
        }

        return respond(409, {
          error: "Your previous payment has succeeded. Please refresh the page."
        });
      }

      if (
        previousStatus === "failed" ||
        previousStatus === "abandoned"
      ) {
        const updated = await updatePayment(
          supabaseUrl,
          dbHeaders,
          payment,
          { status: "Failed" }
        );

        if (!updated.length) {
          return respond(409, {
            error: "Payment status changed. Please refresh and check again."
          });
        }

        continue;
      }

      return respond(409, {
        error: "Your previous payment is still being processed. Please wait and check again."
      });
    }

    const tutorUrl = new URL(`${supabaseUrl}/rest/v1/tutor_profiles`);
    tutorUrl.searchParams.set("id", `eq.${request.tutor_id}`);
    tutorUrl.searchParams.set("select", "session_price_ngn");

    const tutorResponse = await fetch(tutorUrl, { headers: dbHeaders });

    if (!tutorResponse.ok) {
      throw new Error("Could not retrieve the tutor's session price");
    }

    const tutors = await tutorResponse.json();
    const amountNgn = tutors[0]?.session_price_ngn;

    if (!Number.isInteger(amountNgn) || amountNgn <= 0) {
      return respond(400, {
        error: "This tutor has not set a valid session price"
      });
    }

    const reference =
      `studyflow_${request.id}_${Date.now()}_${crypto.randomUUID()}`;

    const paymentInsert = await fetch(
      `${supabaseUrl}/rest/v1/tutoring_payments`,
      {
        method: "POST",
        headers: {
          ...dbHeaders,
          Prefer: "return=minimal"
        },
        body: JSON.stringify({
          request_id: request.id,
          student_id: student.id,
          tutor_id: request.tutor_id,
          amount_ngn: amountNgn,
          reference,
          status: "Pending"
        })
      }
    );

    if (!paymentInsert.ok) {
      const errorText = await paymentInsert.text();
      console.error("Payment record creation failed:", errorText);

      return respond(409, {
        error: "A payment attempt may already be in progress. Please refresh and check again."
      });
    }

    const paystackResponse = await fetch(
      "https://api.paystack.co/transaction/initialize",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${paystackKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email: student.email,
          amount: amountNgn * 100,
          currency: "NGN",
          reference,
          callback_url: "https://studyflow27.netlify.app/payment-callback.html",
          metadata: {
            request_id: request.id,
            student_id: student.id,
            tutor_id: request.tutor_id
          }
        })
      }
    );

    const paystackResult = await paystackResponse.json();

   if (!paystackResponse.ok || !paystackResult.status) {
  const failedUrl = new URL(`${supabaseUrl}/rest/v1/tutoring_payments`);
  failedUrl.searchParams.set("reference", `eq.${reference}`);
  failedUrl.searchParams.set("status", "eq.Pending");

  await fetch(failedUrl, {
    method: "PATCH",
    headers: {
      ...dbHeaders,
      Prefer: "return=minimal"
    },
    body: JSON.stringify({ status: "Failed" })
  });

  return respond(502, {
    error: "Paystack could not start the payment. Please try again."
  });
}

    if (!paystackResult.data?.authorization_url) {
      return respond(502, {
        error: "Payment checkout could not be opened. Please check payment status before retrying."
      });
    }

    return respond(200, {
      authorization_url: paystackResult.data.authorization_url,
      reference,
      amount_ngn: amountNgn
    });

  } catch (error) {
    console.error("Checkout error:", error);

    return respond(500, {
      error: error.message || "Unable to start payment. Please try again."
    });
  }
};
