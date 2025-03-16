// index.js

require('dotenv').config();
const { createJupiterApiClient } = require("@jup-ag/api");
const { Connection, Keypair, VersionedTransaction, PublicKey } = require("@solana/web3.js");
const { Wallet } = require("@project-serum/anchor");
const bs58 = require("bs58").default || require("bs58");
const { transactionSenderAndConfirmationWaiter } = require("./utils/transactionSender");
const { getSignature } = require("./utils/getSignature");

// Configuration
const CONFIG = {
  PRIVATE_KEY: process.env.PRIVATE_KEY || "",
  FLOW: process.env.FLOW || "quote", // Options: "quote" or "quoteAndSwap"
  SLIPPAGE_BPS: 100, // 1%
  DYNAMIC_COMPUTE_UNIT_LIMIT: true,
  DYNAMIC_SLIPPAGE: true,
  PRIORITIZATION_FEE: {
    MAX_LAMPORTS: 10000000,
    PRIORITY_LEVEL: "veryHigh",
  },
  INPUT_MINT: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", // the token from which the amount is debited (for example, USDT)
  OUTPUT_MINT: "So11111111111111111111111111111111111111112", // the token that we receive (for example, Wrapped SOL)
  AMOUNT: "100" // The value can be specified as a number (e.g., “100”), which is a fixed native amount, or as a percentage (e.g., “50%”), which is a percentage of the balance
};

const connection = new Connection("https://api.mainnet-beta.solana.com");
const jupiterQuoteApi = createJupiterApiClient();

try {
  if (!CONFIG.PRIVATE_KEY) throw new Error("Missing configuration: PRIVATE_KEY");
  if (!CONFIG.INPUT_MINT) throw new Error("Missing configuration: INPUT_MINT");
  if (!CONFIG.OUTPUT_MINT) throw new Error("Missing configuration: OUTPUT_MINT");
  if (CONFIG.AMOUNT === undefined || CONFIG.AMOUNT === null) throw new Error("Missing configuration: AMOUNT");
} catch (error) {
  console.error("Configuration error:", error.message);
  process.exit(1);
}

// Automatic mapping of decimal digits for a token via on-chain data
const getTokenDecimals = async (mintAddress) => {
  try {
    const mintPublicKey = new PublicKey(mintAddress);
    const accountInfo = await connection.getParsedAccountInfo(mintPublicKey);
    if (
      accountInfo.value &&
      accountInfo.value.data &&
      accountInfo.value.data.parsed &&
      accountInfo.value.data.parsed.info &&
      typeof accountInfo.value.data.parsed.info.decimals === "number"
    ) {
      return accountInfo.value.data.parsed.info.decimals;
    } else {
      throw new Error("Token decimals not found in account info for " + mintAddress);
    }
  } catch (error) {
    throw new Error("Failed to fetch decimals for token " + mintAddress + ": " + error.message);
  }
};

// Get wallet token balance for a given mint (works for SPL tokens)
const getTokenBalance = async (wallet, tokenMint) => {
  try {
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(wallet.publicKey, { mint: new PublicKey(tokenMint) });
    let balance = 0;
    tokenAccounts.value.forEach(({ account }) => {
      balance += account.data.parsed.info.tokenAmount.uiAmount || 0;
    });
    return balance;
  } catch (error) {
    throw new Error("Failed to fetch token balance for " + tokenMint + ": " + error.message);
  }
};

// Calculate transaction amount
const getAmount = async (wallet) => {
  try {
    const decimals = await getTokenDecimals(CONFIG.INPUT_MINT);
    if (!decimals) throw new Error("Cannot determine token decimals for INPUT_MINT: " + CONFIG.INPUT_MINT);
    
    let amount;
    if (CONFIG.AMOUNT.trim().endsWith("%")) {
      const percentValue = parseFloat(CONFIG.AMOUNT.slice(0, -1));
      if (isNaN(percentValue)) throw new Error("Invalid percentage value in amount: " + CONFIG.AMOUNT);
      const balance = await getTokenBalance(wallet, CONFIG.INPUT_MINT);
      amount = Math.floor((balance * percentValue / 100) * (10 ** decimals));
    } else {
      const fixedValue = parseFloat(CONFIG.AMOUNT);
      if (isNaN(fixedValue)) throw new Error("Invalid fixed amount value: " + CONFIG.AMOUNT);
      amount = fixedValue * (10 ** decimals);
    }
    return amount;
  } catch (error) {
    throw new Error("Failed to calculate amount: " + error.message);
  }
};

// Fetch quote from Jupiter API
const getQuote = async (wallet) => {
  try {
    const amount = await getAmount(wallet);
    const params = {
      inputMint: CONFIG.INPUT_MINT,
      outputMint: CONFIG.OUTPUT_MINT,
      amount: Math.floor(amount),
      slippageBps: CONFIG.SLIPPAGE_BPS,
    };

    const quote = await jupiterQuoteApi.quoteGet(params);
    if (!quote) throw new Error("Unable to fetch quote")

    return quote;
  } catch (error) {
    throw new Error("Failed to fetch quote: " + error.message);
  }
};

// Fetch swap transaction data from Jupiter API
const getSwapResponse = async (wallet, quote) => {
  try {
    return await jupiterQuoteApi.swapPost({
      swapRequest: {
        quoteResponse: quote,
        userPublicKey: wallet.publicKey.toBase58(),
        dynamicComputeUnitLimit: CONFIG.DYNAMIC_COMPUTE_UNIT_LIMIT,
        dynamicSlippage: CONFIG.DYNAMIC_SLIPPAGE,
        prioritizationFeeLamports: {
          priorityLevelWithMaxLamports: {
            maxLamports: CONFIG.PRIORITIZATION_FEE.MAX_LAMPORTS,
            priorityLevel: CONFIG.PRIORITIZATION_FEE.PRIORITY_LEVEL,
          },
        },
      },
    });
  } catch (error) {
    throw new Error("Failed to fetch swap response: " + error.message);
  }
};

// Flow to fetch and display a quote
const flowQuote = async () => {
  try {
    const wallet = new Wallet(Keypair.fromSecretKey(bs58.decode(CONFIG.PRIVATE_KEY)));
    const quote = await getQuote(wallet);
    console.dir(quote, { depth: null });
  } catch (error) {
    console.error("Error fetching quote:", error.message);
  }
};

// Flow to fetch a quote, sign, and send a swap transaction
const flowQuoteAndSwap = async () => {
  try {
    const wallet = new Wallet(Keypair.fromSecretKey(bs58.decode(CONFIG.PRIVATE_KEY)));
    console.log("Wallet:", wallet.publicKey.toBase58());

    const quote = await getQuote(wallet);
    console.dir(quote, { depth: null });

    const swapResponse = await getSwapResponse(wallet, quote);
    console.dir(swapResponse, { depth: null });

    // Deserialize the swap transaction
    const swapTransactionBuf = Uint8Array.from(Buffer.from(swapResponse.swapTransaction, "base64"));
    const transaction = VersionedTransaction.deserialize(swapTransactionBuf);

    // Sign the transaction
    transaction.sign([wallet.payer]);
    const signature = getSignature(transaction);

    // Simulate the transaction to verify success
    const { value: simulatedResponse } = await connection.simulateTransaction(transaction, {
      replaceRecentBlockhash: true,
      commitment: "processed",
    });
    if (simulatedResponse.err) {
      console.error("Simulation error:", simulatedResponse.err, simulatedResponse.logs);
      return;
    }

    // Send the transaction
    const serializedTransaction = Buffer.from(transaction.serialize());
    const blockhash = transaction.message.recentBlockhash;
    const transactionResponse = await transactionSenderAndConfirmationWaiter({
      connection,
      serializedTransaction,
      blockhashWithExpiryBlockHeight: {
        blockhash,
        lastValidBlockHeight: swapResponse.lastValidBlockHeight,
      },
    });

    if (!transactionResponse) {
      console.error("Transaction not confirmed");
      return;
    }
    if (transactionResponse.meta?.err) {
      console.error("Transaction error:", transactionResponse.meta.err);
    }

    console.log(`Transaction confirmed: https://solscan.io/tx/${signature}`);
  } catch (error) {
    console.error("Error during swap:", error.message);
  }
};

// Main execution
(async () => {
  try {
    if (CONFIG.FLOW === "quote") {
      await flowQuote();
    } else if (CONFIG.FLOW === "quoteAndSwap") {
      await flowQuoteAndSwap();
    } else {
      console.error("Set a valid FLOW in configuration (quote or quoteAndSwap)");
    }
  } catch (error) {
    console.error("Unhandled error:", error.message);
  }
})();
