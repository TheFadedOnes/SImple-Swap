import React, { useMemo } from "react";
import {
  ConnectionProvider,
  WalletProvider
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-wallets";

// Example mainnet endpoint
const ALCHEMY_MAINNET_URL =
  "https://solana-mainnet.g.alchemy.com/v2/4NeBCNniguk9JZj4o9tZZ1Ak2ckIVl9M";

/**
 * Wraps Solana connection + wallets + modal
 */
export default function WalletConnectionProvider({ children }) {
  const wallets = useMemo(() => [new PhantomWalletAdapter()], []);

  return (
    <ConnectionProvider endpoint={ALCHEMY_MAINNET_URL}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
