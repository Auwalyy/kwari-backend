import axios from "axios";

export const sendSms = async (to, body) => {
  // Normalize to E.164 without + (Termii uses 2348012345678 format)
  const phone = to.replace(/^\+/, "");

  const response = await axios.post("https://api.ng.termii.com/api/sms/send", {
    to: phone,
    from: process.env.TERMII_SENDER_ID,
    sms: body,
    type: "plain",
    channel: "generic",
    api_key: process.env.TERMII_API_KEY,
  });

  console.log(`📱 SMS sent to ${to} — Status: ${response.data.message}`);
  return response.data;
};
