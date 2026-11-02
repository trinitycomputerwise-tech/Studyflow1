const crypto = require("crypto");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: "Method not allowed"
    };
  }

  const secretKey = process.env.PAYSTACK_SECRET_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!secretKey || !supabaseUrl || !serviceRoleKey) {
    console.error("Missing environment variables");
    return { statusCode: 500, body: "Server configuration error" };
  }

  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body || "", "base64")
    : Buffer.from(event.body || "", "utf8");

  const signature =
    event.headers?.["x-paystack-signature"] ||
    event.headers?.["X-Paystack-Signature"] ||
    "";

  if (!/^[a-f0-9]{128}$/i.test(signature)) {
    return { statusCode: 401, body: "Invalid signature" };
  }

  const expected = crypto
    .createHmac("sha512", secretKey)
    .update(rawBody)
    .digest();

  const received = Buffer.from(signature, "hex");

  if (
    received.length !== expected.length ||
    !crypto.timingSafeEqual(received, expected)
  ) {
    return { statusCode: 401, body: "Invalid signature" };
  }

  let payload;

  try {
    payload = JSON.parse(rawBody.toString("utf8"));
  } catch {
    return { statusCode: 400, body: "Invalid JSON" };
  }

  if (payload.event !== "charge.success") {
    return { statusCode: 200, body: "Event ignored" };
  }

  const transaction = payload.data || {};
  const reference = transaction.reference;

  if (
    !reference ||
    transaction.status !== "success" ||
    transaction.currency !== "NGN"
  ) {
    return { statusCode: 200, body: "Payment event ignored" };
  }

  try {
    const lookupUrl = new URL(
      "/rest/v1/tutoring_payments",
      supabaseUrl
    );

    lookupUrl.searchParams.set("reference", `eq.${reference}`);
    lookupUrl.searchParams.set(
      "select",
      "id,request_id,student_id,tutor_id,amount_ngn,status"
    );

    const lookup = await fetch(lookupUrl, {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`
      }
    });

    if (!lookup.ok) {
      console.error(await lookup.text());
      return { statusCode: 500, body: "Payment lookup failed" };
    }

    const payments = await lookup.json();
    const payment = payments[0];

    if (!payment) {
      return { statusCode: 200, body: "No matching payment" };
    }

    if (payment.status === "Paid") {
      return { statusCode: 200, body: "Already recorded" };
    }

    if (payment.status !== "Pending") {
      return { statusCode: 200, body: "Payment is not pending" };
    }

    const expectedAmount = Math.round(
      Number(payment.amount_ngn) * 100
    );

    if (
      !Number.isFinite(expectedAmount) ||
      Number(transaction.amount) !== expectedAmount
    ) {
      console.error("Payment amount mismatch:", reference);
      return { statusCode: 200, body: "Amount mismatch" };
    }

    const metadata = transaction.metadata || {};

    if (
      (metadata.request_id != null &&
        String(metadata.request_id) !== String(payment.request_id)) ||
      (metadata.student_id != null &&
        String(metadata.student_id) !== String(payment.student_id)) ||
      (metadata.tutor_id != null &&
        String(metadata.tutor_id) !== String(payment.tutor_id))
    ) {
      console.error("Payment metadata mismatch:", reference);
      return { statusCode: 200, body: "Metadata mismatch" };
    }

    const updateUrl = new URL(
      "/rest/v1/tutoring_payments",
      supabaseUrl
    );

    updateUrl.searchParams.set("id", `eq.${payment.id}`);
    updateUrl.searchParams.set("status", "eq.Pending");

    const update = await fetch(updateUrl, {
      method: "PATCH",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
        Prefer: "return=representation"
      },
      body: JSON.stringify({
        status: "Paid",
        paid_at: new Date().toISOString()
      })
    });

    if (!update.ok) {
      console.error(await update.text());
      return { statusCode: 500, body: "Payment update failed" };
    }

    return { statusCode: 200, body: "Webhook processed" };

  } catch (error) {
    console.error("Webhook error:", error);
    return { statusCode: 500, body: "Webhook processing failed" };
  }
};
