import React, { useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Transaction } from "@solana/web3.js";
import axios from "axios";

const MultiTokenSwap = () => {
  const { connection } = useConnection();
  const { publicKey, connected, sendTransaction } = useWallet();

  const [walletTokens, setWalletTokens] = useState([]);
  const [jupiterTokens, setJupiterTokens] = useState([]);
  const [selectedTokens, setSelectedTokens] = useState([]);
  const [swapEstimates, setSwapEstimates] = useState({});
  const [toToken, setToToken] = useState("So11111111111111111111111111111111111111112"); // Default to SOL
  const [toTokenSymbol, setToTokenSymbol] = useState("SOL");

  // Fetch Jupiter token metadata
  useEffect(() => {
    const fetchJupiterTokens = async () => {
      try {
        const response = await axios.get("https://lite-api.jup.ag/tokens/v1");
        setJupiterTokens(response.data);
      } catch (error) {
        console.error("Error fetching Jupiter tokens:", error);
      }
    };
    fetchJupiterTokens();
  }, []);

  // Fetch wallet tokens
  useEffect(() => {
    if (!publicKey) return;

    const fetchWalletTokens = async () => {
      try {
        const tokenAccounts = await connection.getParsedTokenAccountsByOwner(publicKey, {
          programId: TOKEN_PROGRAM_ID,
        });

        const tokens = tokenAccounts.value.map((accountInfo) => {
          const info = accountInfo.account.data.parsed.info;
          return {
            mintAddress: info.mint,
            tokenAmount: info.tokenAmount.uiAmount,
            decimals: info.tokenAmount.decimals,
          };
        });

        // Fetch SOL balance
        const solBalance = await connection.getBalance(publicKey);
        tokens.unshift({
          mintAddress: "So11111111111111111111111111111111111111112",
          tokenAmount: solBalance / 1e9,
          decimals: 9,
        });

        setWalletTokens(tokens);
      } catch (error) {
        console.error("Error fetching wallet tokens:", error);
      }
    };

    fetchWalletTokens();
  }, [publicKey, connection]);

  // Map wallet tokens with Jupiter metadata
  const tokensWithMetadata = walletTokens.map((wt) => {
    const metadata = jupiterTokens.find((jt) => jt.address === wt.mintAddress);
    return {
      ...wt,
      symbol: metadata?.symbol || "UNKNOWN",
      logoURI: metadata?.logoURI || "",
      name: metadata?.name || "",
    };
  });

  // Update toTokenSymbol when toToken changes
  useEffect(() => {
    const metadata = jupiterTokens.find((jt) => jt.address === toToken);
    setToTokenSymbol(metadata?.symbol || "UNKNOWN");
  }, [toToken, jupiterTokens]);

  // Toggle token selection
  const toggleTokenSelection = (mintAddress) => {
    setSelectedTokens((prev) =>
      prev.includes(mintAddress)
        ? prev.filter((addr) => addr !== mintAddress)
        : [...prev, mintAddress]
    );
  };

  // Fetch swap estimates
  useEffect(() => {
    const fetchSwapEstimates = async () => {
      if (!publicKey || selectedTokens.length === 0) return;

      const estimates = {};
      for (const mintAddress of selectedTokens) {
        const tokenInfo = walletTokens.find((t) => t.mintAddress === mintAddress);
        if (!tokenInfo) continue;

        const amountInLamports = Math.floor(tokenInfo.tokenAmount * 10 ** tokenInfo.decimals);
        if (amountInLamports <= 0) continue;

        try {
          const response = await axios.get("https://lite-api.jup.ag/swap/v1/quote", {
            params: {
              inputMint: mintAddress,
              outputMint: toToken,
              amount: amountInLamports.toString(),
              slippageBps: 50,
            },
          });
          const route = response.data.data[0];
          if (route) {
            estimates[mintAddress] = route.outAmount / 10 ** route.outToken.decimals;
          }
        } catch (error) {
          console.error(`Error fetching quote for ${mintAddress}:`, error);
        }
      }
      setSwapEstimates(estimates);
    };

    fetchSwapEstimates();
  }, [selectedTokens, walletTokens, toToken, publicKey]);

  // Batch swap tokens
  const batchSwapTokens = async () => {
    if (selectedTokens.length === 0) {
      alert("Please select tokens to swap.");
      return;
    }
    if (!publicKey) {
      alert("No wallet connected.");
      return;
    }

    for (const mintAddress of selectedTokens) {
      const tokenInfo = walletTokens.find((t) => t.mintAddress === mintAddress);
      if (!tokenInfo) continue;

      const amountInLamports = Math.floor(tokenInfo.tokenAmount * 10 ** tokenInfo.decimals);
      if (amountInLamports <= 0) {
        console.warn(`Skipping ${tokenInfo.symbol}: zero balance.`);
        continue;
      }

      try {
        const quoteResponse = await axios.get("https://lite-api.jup.ag/swap/v1/quote", {
          params: {
            inputMint: mintAddress,
            outputMint: toToken,
            amount: amountInLamports.toString(),
            slippageBps: 50,
          },
        });
        const route = quoteResponse.data.data[0];
        if (!route) {
          console.warn(`No route found for ${tokenInfo.symbol}. Skipping.`);
          continue;
        }

        const swapResponse = await axios.post("https://quote-api.jup.ag/v6/swap", {
          route,
          userPublicKey: publicKey.toBase58(),
        });
        const { swapTransaction } = swapResponse.data;

        const transaction = Transaction.from(Buffer.from(swapTransaction, "base64"));
        const signature = await sendTransaction(transaction, connection);

        await connection.confirmTransaction(signature, "confirmed");

        console.log(`Swap for ${tokenInfo.symbol} successful! Signature: ${signature}`);
      } catch (err) {
        console.error(`Error swapping ${tokenInfo.symbol || mintAddress}:`, err);
      }
    }

    alert("All selected tokens swapped successfully!");
  };

  return (
    <div className="p-6 max-w-lg mx-auto bg-gray-900 text-white shadow-lg rounded-xl">
      <h2 className="text-2xl font-bold mb-4">Multi-Token Swap</h2>

      <div className="mb-4">
        <label className="block text-sm mb-2">Select Tokens to Swap:</label>
        <div className="space-y-2 max-h-48 overflow-y-auto bg-gray-800 p-3 rounded-lg">
          {tokensWithMetadata.length === 0 ? (
            <p className="text-gray-400">No tokens found or wallet not connected.</p>
          ) : (
            tokensWithMetadata.map((token) => (
              <div key={token.mintAddress} className="flex items-center justify-between">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    className="mr-2"
                    checked={selectedTokens.includes(token.mintAddress)}
                    onChange={() => toggleTokenSelection(token.mintAddress)}
                  />
                  {token.logoURI && (
                    <img src={token.logoURI} alt={token.symbol} className="w-5 h-5 mr-2" />
                  )}
                  <span>{token.symbol} ({token.tokenAmount.toFixed(2)})</span>
                </label>
                {swapEstimates[token.mintAddress] !== undefined && (
                  <span className="text-sm text-gray-400">
                    ≈ {swapEstimates[token.mintAddress].toFixed(4)} {toTokenSymbol}
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      <button
        onClick={batchSwapTokens}
        className="bg-green-500 text-white p-3 rounded-lg w-full"
      >
        Swap All Selected Tokens
      </button>
    </div>
  );
};

export default MultiTokenSwap;
