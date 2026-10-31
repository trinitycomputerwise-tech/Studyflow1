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
      return respond(400, { error: "The tutor must approve this request before payment" });
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
      return respond(400, { error: "This tutor has not set a valid session price" });
    }

    const reference = `studyflow_${request.id}_${Date.now()}`;
    const amountKobo = amountNgn * 100;

    const paymentInsert = await fetch(`${supabaseUrl}/rest/v1/tutoring_payments`, {
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
    });

    if (!paymentInsert.ok) {
      throw new Error("Could not create the payment record. Please try again.");
    }

    const paystackResponse = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${paystackKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        email: student.email,
        amount: amountKobo,
        currency: "NGN",
        reference,
        callback_url: "https://studyflow27.netlify.app/payment-callback.html",
        metadata: {
          request_id: request.id,
          student_id: student.id,
          tutor_id: request.tutor_id
        }
      })
    });

    const paystackResult = await paystackResponse.json();

    if (!paystackResponse.ok || !paystackResult.status) {
      await fetch(
        `${supabaseUrl}/rest/v1/tutoring_payments?reference=eq.${encodeURIComponent(reference)}`,
        {
          method: "DELETE",
          headers: dbHeaders
        }
      );
      return respond(502, { error: "Paystack could not start the payment. Please try again." });
    }

    return respond(200, {
      authorization_url: paystackResult.data.authorization_url,
      reference,
      amount_ngn: amountNgn
    });

  } catch (error) {
    console.error("Checkout error:", error);
    return respond(500, { error: "Unable to start payment. Please try again." });
  }
};
