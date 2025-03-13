# Solana Jupiter API Swap Tool

This project is a Node.js tool that integrates with the [Jupiter](https://jup.ag) on the Solana blockchain. It supports two primary flows:
- **Quote Flow**: Retrieves a token swap quote.
- **Quote and Swap Flow**: Retrieves a token swap quote, signs a swap transaction, simulates it, and then sends it to the network.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [Usage](#usage)
- [File Structure](#file-structure)
- [Credits](#credits)

## Prerequisites

- A valid Solana wallet private key (in bs58 format)
- Environment variables set in a `.env` file

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/vkidik/solana-jupiter-swap.git
   cd solana-jupiter-swap
   ```

2. Install dependencies:
   ```bash
   npm install @jup-ag/api @solana/web3.js @project-serum/anchor bs58 promise_retry
   ```

## Configuration

Create a `.env` file in the project root with the following variables:
```env
PRIVATE_KEY=<your_wallet_private_key>
FLOW=quote         # Set to "quote" for quote-only or "quoteAndSwap" for executing a swap
```

The configuration in `index.js` includes additional parameters:
- **SLIPPAGE_BPS**: Slippage tolerance in basis points (default is 100 = 1%).
- **DYNAMIC_COMPUTE_UNIT_LIMIT** & **DYNAMIC_SLIPPAGE**: Flags for dynamic settings.
- **PRIORITIZATION_FEE**: Fee configuration for transaction prioritization.
- **INPUT_MINT / OUTPUT_MINT**: The token mints (e.g., SOL and USDC).
- **AMOUNT_TYPE**: Can be `"AMOUNT"`, or `"PERCENT"`.
- **AMOUNT_VALUE**: The amount to swap (or percentage if using `"PERCENT"`).

## Usage

Run the main file with:
```bash
node index.js
```

- **Quote Flow**: If `FLOW` is set to `quote`, the tool will fetch and display a swap quote.
- **Quote and Swap Flow**: If `FLOW` is set to `quoteAndSwap`, the tool will fetch a quote, sign a swap transaction, simulate it, and send it to the Solana network. A confirmation URL is logged upon success.

## File Structure

- **index.js**: Main entry point that handles the quote/swap flows.
- **utils/getSignature.js**: Extracts and encodes the transaction signature.
- **utils/transactionSender.js**: Handles sending the transaction and waiting for its confirmation.

## Credits
This project was developed based on examples from the [Jupiter API](https://station.jup.ag/docs/api) documentation and [Jupiter GitHub](https://github.com/jup-ag/jupiter-quote-api-node).