import React, { useEffect, useState } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Transaction } from "@solana/web3.js";
import axios from "axios";

const Swap = () => {
  const { publicKey, sendTransaction, connected } = useWallet();
  const { connection } = useConnection();

  const [walletTokens, setWalletTokens] = useState([]);
  const [jupiterTokens, setJupiterTokens] = useState([]);
  const [fromToken, setFromToken] = useState(null);
  const [toToken, setToToken] = useState("So11111111111111111111111111111111111111112"); 
  const [amount, setAmount] = useState("");
  const [route, setRoute] = useState(null);

  useEffect(() => {
    console.log("Wallet Connected:", connected);
    console.log("Public Key:", publicKey?.toBase58());
  }, [connected, publicKey]);

  // Fetch wallet tokens
  useEffect(() => {
    if (!publicKey) return;

    const fetchWalletTokens = async () => {
      try {
        const tokenAccounts = await connection.getParsedTokenAccountsByOwner(publicKey, {
          programId: TOKEN_PROGRAM_ID,
        });

        const tokens = tokenAccounts.value.map((accountInfo) => {
          const parsedInfo = accountInfo.account.data.parsed.info;
          return {
            mintAddress: parsedInfo.mint,
            tokenAmount: parsedInfo.tokenAmount.uiAmount,
            decimals: parsedInfo.tokenAmount.decimals,
          };
        });

        // Add SOL
        const solBalance = await connection.getBalance(publicKey);
        tokens.unshift({
          mintAddress: "So11111111111111111111111111111111111111112",
          tokenAmount: solBalance / 1e9,
          decimals: 9,
          symbol: "SOL",
        });

        console.log("Fetched Wallet Tokens:", tokens);
        setWalletTokens(tokens);
      } catch (error) {
        console.error("Error fetching wallet tokens:", error);
      }
    };

    fetchWalletTokens();
  }, [publicKey, connection]);

  // Jupiter tokens
  useEffect(() => {
    const fetchJupiterTokens = async () => {
      const response = await axios.get("https://quote-api.jup.ag/v4/tokens");
      setJupiterTokens(response.data);
    };
    fetchJupiterTokens();
  }, []);

  // Merge metadata
  const tokensWithSymbols = walletTokens.map((wt) => {
    const jt = jupiterTokens.find((j) => j.address === wt.mintAddress);
    return {
      ...wt,
      symbol: jt ? jt.symbol : wt.symbol || "UNKNOWN",
      logoURI: jt ? jt.logoURI : "",
    };
  });

  // Get quote
  const getQuote = async () => {
    if (!fromToken || !toToken || !amount) return;
    const amountInLamports = Math.floor(parseFloat(amount) * 10 ** fromToken.decimals);

    const response = await axios.get("https://quote-api.jup.ag/v4/quote", {
      params: {
        inputMint: fromToken.mintAddress,
        outputMint: toToken,
        amount: amountInLamports,
        slippageBps: 50,
      },
    });

    if (response.data.data && response.data.data.length > 0) {
      setRoute(response.data.data[0]);
    }
  };

  // Execute the swap
  const executeSwap = async () => {
    if (!route || !publicKey) return;

    const swapResponse = await axios.post("https://quote-api.jup.ag/v4/swap", {
      route,
      userPublicKey: publicKey.toBase58(),
    });

    const { swapTransaction } = swapResponse.data;
    const transaction = Transaction.from(Buffer.from(swapTransaction, "base64"));
    const signature = await sendTransaction(transaction, connection);

    await connection.confirmTransaction(signature, "confirmed");
    alert(`Swap successful! Tx Signature: ${signature}`);
  };

  return (
    <div className="p-6 max-w-md mx-auto bg-gray-900 text-white shadow-lg rounded-2xl">
      <h2 className="text-xl font-bold mb-4">Simple Token Swap</h2>

      {/* From token */}
      <div className="mb-4">
        <label className="block text-sm mb-1">Select Token to Swap From</label>
        <select
          className="bg-gray-700 text-white p-3 rounded-lg w-full"
          value={fromToken ? fromToken.mintAddress : ""}
          onChange={(e) => {
            const t = tokensWithSymbols.find((tk) => tk.mintAddress === e.target.value);
            setFromToken(t);
          }}
        >
          <option value="">Select Token</option>
          {tokensWithSymbols.map((token) => (
            <option key={token.mintAddress} value={token.mintAddress}>
              {token.symbol} ({token.tokenAmount.toFixed(2)})
            </option>
          ))}
        </select>
      </div>

      {/* Amount */}
      <input
        type="number"
        placeholder="Amount to Swap"
        className="bg-gray-700 text-white p-3 rounded-lg w-full mb-4"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
      />

      {/* To token */}
      <div className="mb-4">
        <label className="block text-sm mb-1">Receive Token</label>
        <select
          className="bg-gray-700 text-white p-3 rounded-lg w-full"
          value={toToken}
          onChange={(e) => setToToken(e.target.value)}
        >
          <option value="So11111111111111111111111111111111111111112">SOL</option>
          <option value="EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v">USDC</option>
        </select>
      </div>

      {/* Quote button */}
      <button className="bg-green-500 text-white p-3 rounded-lg w-full mb-2" onClick={getQuote}>
        Get Quote
      </button>

      {/* If quote found */}
      {route && (
        <div className="bg-gray-700 p-4 rounded-lg mt-4">
          <p>Estimated Output: {(route.outAmount / 1e9).toFixed(6)}</p>
          <button className="bg-blue-500 text-white p-3 rounded-lg w-full mt-2" onClick={executeSwap}>
            Execute Swap
          </button>
        </div>
      )}
    </div>
  );
};

export default Swap;
