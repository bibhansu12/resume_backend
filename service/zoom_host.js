/*
This module handles all Zoom Meeting SDK authentication and token generation.
*/
const jwt = require(jsonwebToken);
const axios = require(axios);

function makeMettingSignature(mettingNumber, role =0){
    const sdkKey = process.env.ZOOM_SDK_KEY;
    const sdkSecret =process.env.Zoom_SDK_SECRET;
    const iat = Math.floor(Date.now() / 1000) - 30;
    const exp = iat + 60 * 60 * 2;
   return jwt.sign(
    { sdkKey, mn: String(meetingNumber), role, iat, exp, appKey: sdkKey, tokenExp: exp },
    sdkSecret,
    { algorithm: 'HS256' }
  );
}
async function getS2SToken() {
    const { ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET } = process.env;
    if (!ZOOM_ACCOUNT_ID || !ZOOM_CLIENT_ID || !ZOOM_CLIENT_SECRET) return null;
    const basic = Buffer.from(`${ZOOM_CLIENT_ID}:${ZOOM_CLIENT_SECRET}`).toString('base64');
    const{data} = await axios.post(
        `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${ZOOM_ACCOUNT_ID}`,
    null,
    { headers: { Authorization: `Basic ${basic}` } }
  );
  return data.access_token;
}

async function getZak(){
    
}


    