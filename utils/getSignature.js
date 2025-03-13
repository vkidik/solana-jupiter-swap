// getSignature.js

const bs58 = require("bs58").default || require("bs58");

const getSignature = (transaction) => {
  // Use the 'signature' field if available; otherwise, use the first signature.
  const signature = transaction.signature || transaction.signatures[0];
  if (!signature) {
    throw new Error("Missing transaction signature; transaction was not signed by fee payer");
  }
  return bs58.encode(signature);
}

module.exports = { getSignature };
