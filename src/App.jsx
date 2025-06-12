import React from "react";
import "./App.css"; // Toilet styling
import WalletConnectionProvider from "./components/WalletConnectionProvider";
import MergedSwap from "./components/MergedSwap";

// If you use @solana/wallet-adapter-react-ui, you can do:
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

export default function App() {
  return (
    <WalletConnectionProvider>
      {/* 
        Body is centered by CSS. We'll just place a "Connect" button top-right 
        or wherever you prefer.
      */}
      <div style={{ position: "absolute", top: 20, right: 20 }}>
        <WalletMultiButton className="connect-button" />
      </div>

      {/* Our main "Toilet" swap UI */}
      <MergedSwap />
    </WalletConnectionProvider>
  );
}
