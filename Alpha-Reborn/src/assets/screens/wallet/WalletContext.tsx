import React, { createContext, useContext, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

type Transaction = {
  id: string;
  type: "buy" | "sell";
  amount: number;
  date: string;
};

type WalletContextType = {
  balance: number;
  transactions: Transaction[];
  buyCoins: (usd: number) => void;
  sellCoins: (mcoin: number) => void;
};

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export const WalletProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [balance, setBalance] = useState<number>(0);
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  // Load wallet from AsyncStorage
  useEffect(() => {
    (async () => {
      const storedBalance = await AsyncStorage.getItem("wallet_balance");
      const storedTransactions = await AsyncStorage.getItem("wallet_transactions");

      if (storedBalance) setBalance(Number(storedBalance));
      if (storedTransactions) setTransactions(JSON.parse(storedTransactions));
    })();
  }, []);

  // Save wallet anytime it changes
  useEffect(() => {
    AsyncStorage.setItem("wallet_balance", balance.toString());
    AsyncStorage.setItem("wallet_transactions", JSON.stringify(transactions));
  }, [balance, transactions]);

  // Buy: 1 USD = 45 M-Coins
  const buyCoins = (usd: number) => {
    const amount = usd * 45;
    setBalance((prev) => prev + amount);
    const newTx: Transaction = {
      id: Date.now().toString(),
      type: "buy",
      amount,
      date: new Date().toISOString(),
    };
    setTransactions((prev) => [newTx, ...prev]);
  };

  // Sell: 50 M-Coins = 1 USD
  const sellCoins = (mcoin: number) => {
    if (mcoin > balance) {
      alert("Not enough balance!");
      return;
    }
    const usd = mcoin / 50;
    setBalance((prev) => prev - mcoin);
    const newTx: Transaction = {
      id: Date.now().toString(),
      type: "sell",
      amount: mcoin,
      date: new Date().toISOString(),
    };
    setTransactions((prev) => [newTx, ...prev]);
    alert(`You received ${usd.toFixed(2)} in your currency for selling ${mcoin} M-Coins`);
  };

  return (
    <WalletContext.Provider value={{ balance, transactions, buyCoins, sellCoins }}>
      {children}
    </WalletContext.Provider>
  );
};

// Hook
export const useWallet = () => {
  const context = useContext(WalletContext);
  if (!context) throw new Error("useWallet must be used inside WalletProvider");
  return context;
};
