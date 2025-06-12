import React, { useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { VersionedTransaction } from "@solana/web3.js";  // Import for versioned transactions
import axios from "axios";

// --- Jupiter V6 endpoints ---
const QUOTE_URL = "https://quote-api.jup.ag/v6/quote";
const SWAP_URL = "https://quote-api.jup.ag/v6/swap";

// Rate limit ~1 request/sec
const REQUEST_INTERVAL_MS = 1000;
let lastRequestTimestamp = 0;

async function enforceRateLimit() {
  const now = Date.now();
  const elapsed = now - lastRequestTimestamp;
  if (elapsed < REQUEST_INTERVAL_MS) {
    await new Promise((resolve) => setTimeout(resolve, REQUEST_INTERVAL_MS - elapsed));
  }
  lastRequestTimestamp = Date.now();
}

async function rateLimitedGet(url, config) {
  await enforceRateLimit();
  return axios.get(url, config);
}

async function rateLimitedPost(url, data) {
  await enforceRateLimit();
  return axios.post(url, data);
}

async function rateLimitedConnectionCall(connection, methodName, ...args) {
  await enforceRateLimit();
  return connection[methodName](...args);
}

export default function MergedSwap() {
  const { connection } = useConnection();
  const { publicKey, connected, sendTransaction } = useWallet();
  const [walletTokens, setWalletTokens] = useState([]);
  const [quoteObj, setQuoteObj] = useState(null);
  const [fromMintAddress, setFromMintAddress] = useState("");
  const [fromAmount, setFromAmount] = useState("");
  const [toMintAddress, setToMintAddress] = useState("So11111111111111111111111111111111111111112");
  const [slippage, setSlippage] = useState(0.5);
  const [estimatedOutput, setEstimatedOutput] = useState("");

  useEffect(() => {
    console.log("Wallet connected:", connected);
    console.log("Public key:", publicKey?.toBase58());
  }, [connected, publicKey]);

  useEffect(() => {
    if (!publicKey) return;
    const fetchWalletTokens = async () => {
      try {
        const tokenAccounts = await rateLimitedConnectionCall(
          connection,
          "getParsedTokenAccountsByOwner",
          publicKey,
          { programId: TOKEN_PROGRAM_ID }
        );
        const tokens = tokenAccounts.value.map((acct) => {
          const info = acct.account.data.parsed.info;
          return {
            mintAddress: info.mint,
            tokenAmount: info.tokenAmount.uiAmount,
            decimals: info.tokenAmount.decimals,
          };
        });
        const solBalance = await rateLimitedConnectionCall(connection, "getBalance", publicKey);
        tokens.unshift({
          mintAddress: "So11111111111111111111111111111111111111112",
          tokenAmount: solBalance / 1e9,
          decimals: 9,
          symbol: "SOL",
        });
        console.log("Fetched wallet tokens:", tokens);
        setWalletTokens(tokens);
      } catch (err) {
        console.error("Error fetching wallet tokens:", err);
      }
    };
    fetchWalletTokens();
  }, [publicKey, connection]);

  const tokensWithSymbol = walletTokens.map((tk) => ({
    ...tk,
    symbol: tk.symbol ?? "UNKNOWN",
  }));

  async function getSingleSwapQuote() {
    if (!publicKey || !fromMintAddress || !toMintAddress || !fromAmount) {
      alert("Select 'From' token, 'To' token, and amount.");
      return;
    }
    if (fromMintAddress === toMintAddress) {
      alert("The 'From' and 'To' tokens cannot be the same.");
      return;
    }

    const fromTokenInfo = tokensWithSymbol.find((t) => t.mintAddress === fromMintAddress);
    const lamports = (Math.floor(parseFloat(fromAmount) * 10 ** fromTokenInfo.decimals)).toString();
    const slippageBps = (slippage * 100).toString();

    console.log("Requesting quote with:", {
      inputMint: fromMintAddress,
      outputMint: toMintAddress,
      amount: lamports,
      slippageBps,
      restrictIntermediateTokens: true,
    });

    try {
      const resp = await rateLimitedGet(QUOTE_URL, {
        params: {
          inputMint: fromMintAddress,
          outputMint: toMintAddress,
          amount: lamports,
          slippageBps,
          restrictIntermediateTokens: true,
        },
      });
      const quote = resp.data;
      console.log("Quote response:", quote);

      if (quote.routePlan && quote.routePlan.length > 0) {
        setQuoteObj(quote);
        const toDecimals = toMintAddress === "So11111111111111111111111111111111111111112" ? 9 : 6;
        const outAmt = parseFloat(quote.outAmount) / Math.pow(10, toDecimals);
        setEstimatedOutput(outAmt.toFixed(6));
      } else {
        alert("No route found for that swap.");
      }
    } catch (err) {
      console.error("Error fetching single-swap quote:", err.response ? err.response.data : err);
      alert("Error getting quote. Check console for details.");
    }
  }

  async function executeSingleSwap() {
    if (!quoteObj || !publicKey) return;
    try {
      const swapResp = await rateLimitedPost(SWAP_URL, {
        quoteResponse: quoteObj,
        userPublicKey: publicKey.toBase58(),
        wrapAndUnwrapSol: true,
      });
      const { swapTransaction } = swapResp.data;
      const transaction = VersionedTransaction.deserialize(Buffer.from(swapTransaction, "base64"));  // Corrected for versioned transactions
      const signature = await sendTransaction(transaction, connection);
      await connection.confirmTransaction(signature, "confirmed");
      alert(`Swap successful! Tx: ${signature}`);
      setQuoteObj(null);
      setEstimatedOutput("");
    } catch (err) {
      console.error("Error executing single swap:", err.response ? err.response.data : err);
      alert("Single-swap failed. See console.");
    }
  }

  async function swapAllTokens() {
    if (!publicKey || !toMintAddress) {
      alert("No wallet connected or 'To' token not selected.");
      return;
    }

    const tokensToSwap = tokensWithSymbol.filter(
      (t) => t.mintAddress !== toMintAddress && t.tokenAmount > 0
    );
    if (tokensToSwap.length === 0) {
      alert("No tokens to swap.");
      return;
    }

    for (const tk of tokensToSwap) {
      const lamports = (Math.floor(tk.tokenAmount * 10 ** tk.decimals)).toString();
      const slippageBps = (slippage * 100).toString();

      try {
        const quoteRes = await rateLimitedGet(QUOTE_URL, {
          params: {
            inputMint: tk.mintAddress,
            outputMint: toMintAddress,
            amount: lamports,
            slippageBps,
            restrictIntermediateTokens: true,
          },
        });
        const multiQuote = quoteRes.data;
        if (!multiQuote.routePlan || multiQuote.routePlan.length === 0) {
          console.warn(`No route found for ${tk.symbol}, skipping.`);
          continue;
        }

        const swapRes = await rateLimitedPost(SWAP_URL, {
          quoteResponse: multiQuote,
          userPublicKey: publicKey.toBase58(),
          wrapAndUnwrapSol: true,
        });
        const { swapTransaction } = swapRes.data;
        const transaction = VersionedTransaction.deserialize(Buffer.from(swapTransaction, "base64"));  // Corrected for versioned transactions
        const signature = await sendTransaction(transaction, connection);
        await rateLimitedConnectionCall(connection, "confirmTransaction", signature, "confirmed");
        console.log(`Swapped ${tk.symbol} successfully! Sig: ${signature}`);
      } catch (err) {
        console.error(`Error swapping ${tk.symbol}:`, err.response ? err.response.data : err);
      }
    }
    alert("All tokens swapped successfully!");
  }

  return (
    <div className="swap-container">
      <div className="swap-header">
        <div className="swap-title">The Toilet</div>
      </div>

      <div className="swap-form">
        <div className="token-select">
          <label htmlFor="from-amount">From</label>
          <input
            type="number"
            id="from-amount"
            placeholder="0.00"
            value={fromAmount}
            onChange={(e) => {
              setFromAmount(e.target.value);
              setQuoteObj(null);
              setEstimatedOutput("");
            }}
          />
          <select
            id="from-token"
            value={fromMintAddress}
            onChange={(e) => {
              setFromMintAddress(e.target.value);
              setQuoteObj(null);
              setEstimatedOutput("");
            }}
          >
            <option value="">--Select--</option>
            <option value="ALL">ALL TOKENS</option>
            {tokensWithSymbol.map((t) => (
              <option key={t.mintAddress} value={t.mintAddress}>
                {t.symbol} ({t.tokenAmount.toFixed(2)})
              </option>
            ))}
          </select>
        </div>

        <div className="token-select">
          <label htmlFor="to-amount">To</label>
          <input type="number" id="to-amount" placeholder="0.00" disabled value={estimatedOutput} />
          <select
            id="to-token"
            value={toMintAddress}
            onChange={(e) => {
              setToMintAddress(e.target.value);
              setQuoteObj(null);
              setEstimatedOutput("");
            }}
          >
            <option value="So11111111111111111111111111111111111111112">SOL</option>
            <option value="EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v">USDC</option>
            <option value="Es9vMFrzaCER5Z9EuFbc6tZzzLLndgUkGL9NWtwWkPdb">USDT</option>
          </select>
        </div>
      </div>

      <div className="info-section">
        <div>Est. Price: 0.0025 SOL per USDC</div>
        <div className="slippage-settings">
          <label htmlFor="slippage">Slippage:</label>
          <input
            type="number"
            id="slippage"
            value={slippage}
            step="0.1"
            onChange={(e) => {
              const val = parseFloat(e.target.value);
              if (Number.isNaN(val) || val < 0) {
                alert("Slippage cannot be negative. Resetting to 0.5%");
                setSlippage(0.5);
                return;
              }
              setSlippage(val);
              setQuoteObj(null);
            }}
          />
          %
        </div>
      </div>

      <button
        className="swap-button"
        onClick={() => {
          if (!fromMintAddress) {
            alert("Select a 'From' token or 'ALL TOKENS'.");
            return;
          }
          if (fromMintAddress !== "ALL" && fromMintAddress === toMintAddress) {
            alert("The 'From' and 'To' tokens cannot be the same.");
            return;
          }
          if (fromMintAddress === "ALL") {
            swapAllTokens();
          } else {
            if (!quoteObj) {
              getSingleSwapQuote();
            } else {
              executeSingleSwap();
            }
          }
        }}
      >
        Flush Swap
      </button>
    </div>
  );
}
