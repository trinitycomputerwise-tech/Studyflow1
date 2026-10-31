const supabaseHeaders = (secretKey) => ({
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

  const respond = (statusCode, data) => ({
    statusCode,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: corsHeaders, body: "" };
  }

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

    const accessToken = (event.headers.authorization || "").replace(/^Bearer\s+/i, "");
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
      return respond(401, { error: "Your login session is invalid. Please sign in again." });
    }

    const student = await authResponse.json();
    const { reference } = JSON.parse(event.body || "{}");

    if (!reference || typeof reference !== "string") {
      return respond(400, { error: "A payment reference is required" });
    }

    const dbHeaders = supabaseHeaders(supabaseKey);

    const paymentUrl = new URL(`${supabaseUrl}/rest/v1/tutoring_payments`);
    paymentUrl.searchParams.set("reference", `eq.${reference}`);
    paymentUrl.searchParams.set(
      "select",
      "id,request_id,student_id,tutor_id,amount_ngn,reference,status"
    );

    const paymentResponse = await fetch(paymentUrl, { headers: dbHeaders });

    if (!paymentResponse.ok) {
      throw new Error("Could not retrieve the payment record");
    }

    const payments = await paymentResponse.json();
    const payment = payments[0];

    if (!payment || payment.student_id !== student.id) {
      return respond(404, { error: "Payment record not found" });
    }

    if (payment.status === "Paid") {
      return respond(200, { status: "Paid", message: "This payment is already confirmed." });
    }

    if (payment.status !== "Pending") {
      return respond(400, { error: "This payment is not pending" });
    }

    const verifyResponse = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      {
        headers: {
          Authorization: `Bearer ${paystackKey}`,
          "Content-Type": "application/json"
        }
      }
    );

    const verifyResult = await verifyResponse.json();

    if (
      !verifyResponse.ok ||
      !verifyResult.status ||
      !verifyResult.data ||
      verifyResult.data.status !== "success"
    ) {
      return respond(400, { error: "Paystack has not confirmed this payment as successful" });
    }

    const transaction = verifyResult.data;

    if (
      transaction.reference !== payment.reference ||
      transaction.amount !== payment.amount_ngn * 100 ||
      transaction.currency !== "NGN" ||
      transaction.metadata?.request_id !== payment.request_id ||
      transaction.metadata?.student_id !== payment.student_id ||
      transaction.metadata?.tutor_id !== payment.tutor_id
    ) {
      return respond(400, { error: "Payment details do not match the tutoring request" });
    }

    const updateUrl = new URL(`${supabaseUrl}/rest/v1/tutoring_payments`);
    updateUrl.searchParams.set("id", `eq.${payment.id}`);
    updateUrl.searchParams.set("status", "eq.Pending");

    const updateResponse = await fetch(updateUrl, {
      method: "PATCH",
      headers: {
        ...dbHeaders,
        Prefer: "return=representation"
      },
      body: JSON.stringify({
        status: "Paid",
        paid_at: new Date().toISOString()
      })
    });

    if (!updateResponse.ok) {
      throw new Error("Could not update the payment record");
    }

    const updatedPayments = await updateResponse.json();

    if (!updatedPayments.length) {
      return respond(409, { error: "Payment status changed. Please refresh and check again." });
    }

    return respond(200, {
      status: "Paid",
      reference: payment.reference,
      amount_ngn: payment.amount_ngn,
      message: "Payment successfully verified."
    });

  } catch (error) {
    console.error("Payment verification error:", error);
    return respond(500, { error: "Unable to verify payment. Please try again." });
  }
};
