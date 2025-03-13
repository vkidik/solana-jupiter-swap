// transactionSender.js

const { TransactionExpiredBlockheightExceededError } = require("@solana/web3.js");
const promiseRetry = require("promise-retry");

const SEND_OPTIONS = {
  skipPreflight: true,
};

const wait = (time) => { return new Promise(resolve => setTimeout(resolve, time)) }

const transactionSenderAndConfirmationWaiter = async ({
  connection,
  serializedTransaction,
  blockhashWithExpiryBlockHeight,
}) => {
  const txid = await connection.sendRawTransaction(serializedTransaction, SEND_OPTIONS);
  const controller = new AbortController();
  const abortSignal = controller.signal;

  // Continuously resend the transaction until confirmation or abort.
  const abortableResender = async () => {
    while (true) {
      await wait(2000);
      if (abortSignal.aborted) return;
      try {
        await connection.sendRawTransaction(serializedTransaction, SEND_OPTIONS);
      } catch (e) {
        console.warn(`Failed to resend transaction: ${e}`);
      }
    }
  };

  try {
    abortableResender();
    const lastValidBlockHeight = blockhashWithExpiryBlockHeight.lastValidBlockHeight;

    // Attempt to confirm the transaction; error if blockhash has expired.
    await Promise.race([
      connection.confirmTransaction(
        {
          ...blockhashWithExpiryBlockHeight,
          lastValidBlockHeight,
          signature: txid,
          abortSignal,
        },
        "confirmed"
      ),
      new Promise(async (resolve) => {
        while (!abortSignal.aborted) {
          await wait(2000);
          const tx = await connection.getSignatureStatus(txid, { searchTransactionHistory: false });
          if (tx && tx.value && tx.value.confirmationStatus === "confirmed") {
            resolve(tx);
          }
        }
      }),
    ]);
  } catch (e) {
    if (e instanceof TransactionExpiredBlockheightExceededError) {
      return null;
    } else {
      throw e;
    }
  } finally {
    controller.abort();
  }

  // Retry fetching the transaction confirmation if RPC is lagging.
  const response = promiseRetry(
    async (retry) => {
      const response = await connection.getTransaction(txid, {
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0,
      });
      if (!response) {
        retry(response);
      }
      return response;
    },
    {
      retries: 5,
      minTimeout: 1000,
    }
  );

  return response;
}

module.exports = { transactionSenderAndConfirmationWaiter };
