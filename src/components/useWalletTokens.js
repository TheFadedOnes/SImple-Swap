import { useEffect, useState } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";

const useWalletTokens = () => {
  const { publicKey } = useWallet();
  const { connection } = useConnection();
  const [walletTokens, setWalletTokens] = useState([]);

  useEffect(() => {
    if (!publicKey) return;

    const fetchTokens = async () => {
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

        console.log("Fetched Wallet Tokens:", tokens);  // Debugging Line
        setWalletTokens(tokens);
      } catch (error) {
        console.error("Error fetching wallet tokens:", error);
      }
    };

    fetchTokens();
  }, [publicKey, connection]);

  return walletTokens;
};

export default useWalletTokens;
