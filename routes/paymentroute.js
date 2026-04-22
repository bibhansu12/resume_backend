const express = require("express");
const router = express.Router();
const db = require("../database/db");
const verifyToken = require("../verifytoken");
const crypto = require("crypto");
require("dotenv").config(); 


const ESEWA_TEST_PID = "EPAYTEST";
const ESEWA_TEST_SECRET = "8gBm/:&EnhH.1/q";
const ESEWA_URL = "https://rc-epay.esewa.com.np/api/epay/main/v2/form";


const KHALTI_TEST_SECRET = process.env.KHALTI_SECRET_KEY || "Key 94ec078e4d3f4bba93da8ed7a0cf5de4"; 
const KHALTI_INIT_URL = "https://a.khalti.com/api/v2/epayment/initiate/";
const KHALTI_LOOKUP_URL = "https://a.khalti.com/api/v2/epayment/lookup/";


function getBaseUrl(req) {
  const host = req.get('host');
  const protocol = req.protocol || 'http';
  return `${protocol}://${host}`; 
}


router.post("/init", verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { provider, amount } = req.body;
    
    const baseUrl = getBaseUrl(req);

    if (provider === 'eSewa') {
      
      const redirectUrl = `${baseUrl}/api/payment/esewa/redirect?userId=${userId}&amount=${amount}`;
      return res.status(200).json({ paymentUrl: redirectUrl });
    } 
    else if (provider === 'Khalti') {
      
      const returnUrl = `${baseUrl}/api/payment/khalti/success?userId=${userId}`;
      const purchaseOrderId = `ORDER_${Date.now()}_${userId}`;
      const amountInPaisa = amount * 100;

      
      const response = await fetch(KHALTI_INIT_URL, {
        method: 'POST',
        headers: {
          'Authorization': KHALTI_TEST_SECRET,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          return_url: returnUrl,
          website_url: baseUrl,
          amount: amountInPaisa,
          purchase_order_id: purchaseOrderId,
          purchase_order_name: "Premium Unlocking Fees",
        })
      });

      const data = await response.json();
      if (response.ok && data.payment_url) {
        return res.status(200).json({ paymentUrl: data.payment_url });
      } else {
        return res.status(400).json({ message: "Khalti initialization failed", details: data });
      }
    } else {
      return res.status(400).json({ message: "Invalid provider specified" });
    }
  } catch (err) {
    console.error("[PAYMENT] /init error:", err);
    return res.status(500).json({ message: "Server error", error: err.message });
  }
});


// 2. ESEWA REDIRECT MIDDLEWARE ENGINER

router.get("/esewa/redirect", (req, res) => {
  const { userId, amount } = req.query;
  const baseUrl = getBaseUrl(req);
  
  const transaction_uuid = `ESEWA_${Date.now()}_${userId}`;
  const total_amount = amount || 500;
  const tax_amount = 0;
  
  // Signature creation algorithm as per eSewa v2 Standard
  const signed_field_names = "total_amount,transaction_uuid,product_code";
  const message = `total_amount=${total_amount},transaction_uuid=${transaction_uuid},product_code=${ESEWA_TEST_PID}`;
  
  const hash = crypto.createHmac('sha256', ESEWA_TEST_SECRET).update(message).digest('base64');
  
  const success_url = `${baseUrl}/api/payment/esewa/success?userId=${userId}`;
  const failure_url = `${baseUrl}/api/payment/esewa/failure`;

  // HTML page that autosubmits when rendered by browser
  const html = `
  <!DOCTYPE html>
  <html>
  <head><title>Redirecting to eSewa...</title></head>
  <body>
    <p>Please wait while we redirect you to eSewa Secure Payment Gateway...</p>
    <form action="${ESEWA_URL}" method="POST" id="esewaForm">
      <input type="hidden" name="amount" value="${total_amount}" />
      <input type="hidden" name="tax_amount" value="${tax_amount}" />
      <input type="hidden" name="total_amount" value="${total_amount}" />
      <input type="hidden" name="transaction_uuid" value="${transaction_uuid}" />
      <input type="hidden" name="product_code" value="${ESEWA_TEST_PID}" />
      <input type="hidden" name="product_service_charge" value="0" />
      <input type="hidden" name="product_delivery_charge" value="0" />
      <input type="hidden" name="success_url" value="${success_url}" />
      <input type="hidden" name="failure_url" value="${failure_url}" />
      <input type="hidden" name="signed_field_names" value="${signed_field_names}" />
      <input type="hidden" name="signature" value="${hash}" />
    </form>
    <script>
      document.getElementById('esewaForm').submit();
    </script>
  </body>
  </html>
  `;
  res.send(html);
});


// 3. ESEWA CALLBACK HANDLER 
router.get("/esewa/success", async (req, res) => {
  const { data, userId } = req.query; 
  try {
    if (data) {
      const decoded = Buffer.from(data, 'base64').toString('ascii');
      const responseObj = JSON.parse(decoded);
      
      if (responseObj.status === 'COMPLETE') {
        const updateSql = "UPDATE users SET is_premium = TRUE WHERE id = ?";
        await db.query(updateSql, [userId]);
        return renderSuccessPage(res);
      }
    }
  } catch (err) {
    console.error("eSewa success verification error", err);
  }
  return renderFailurePage(res, "eSewa payment verification failed due to invalid data integrity.");
});

router.get("/esewa/failure", (req, res) => {
  return renderFailurePage(res, "Payment was cancelled or failed on eSewa.");
});

// 4. KHALTI CALLBACK HANDLER

router.get("/khalti/success", async (req, res) => {
  const { pidx, status, userId } = req.query;
  try {
    if (status === 'Completed' && pidx) {
      
      const response = await fetch(KHALTI_LOOKUP_URL, {
        method: 'POST',
        headers: {
          'Authorization': KHALTI_TEST_SECRET,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ pidx })
      });
      const data = await response.json();

      if (data.status === 'Completed') {
        const updateSql = "UPDATE users SET is_premium = TRUE WHERE id = ?";
        await db.query(updateSql, [userId]);
        return renderSuccessPage(res);
      }
    }
  } catch (err) {
    console.error("Khalti success validation error", err);
  }
  return renderFailurePage(res, "Khalti payment verification failed unexpectedly.");
});


// 5. STATUS POLLING ENDPOINT

router.get("/status", verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const sql = "SELECT is_premium FROM users WHERE id = ?";
    const [rows] = await db.query(sql, [userId]);
    if (rows && rows.length > 0) {
      return res.status(200).json({ is_premium: !!rows[0].is_premium });
    }
    return res.status(404).json({ message: "User not found" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});



// VISUAL HTML HELPERS

function renderSuccessPage(res) {
  res.send(`
  <!DOCTYPE html>
  <html>
  <head><title>Payment Successful</title></head>
  <body style="text-align:center; padding: 50px; font-family: sans-serif;">
    <h1 style="color: green;">Payment Successful!</h1>
    <p>Your premium features have been unlocked.</p>
    <p>You can safely close this tab to return back to the application.</p>
    <script>
      setTimeout(() => { window.close(); }, 3000);
    </script>
  </body>
  </html>
  `);
}

function renderFailurePage(res, msg) {
  res.send(`
  <!DOCTYPE html>
  <html>
  <head><title>Payment Failed</title></head>
  <body style="text-align:center; padding: 50px; font-family: sans-serif;">
    <h1 style="color: red;">Payment Failed</h1>
    <p>${msg}</p>
    <p>Please close this tab and select a payment method again.</p>
    <script>
      setTimeout(() => { window.close(); }, 3000);
    </script>
  </body>
  </html>
  `);
}

module.exports = router;
