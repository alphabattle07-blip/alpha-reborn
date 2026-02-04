import React from 'react';
import AyoComputerUI from "./computer/AyoComputerUI";
import AyoOnlineUI from "./online/AyoOnlineUI";
import { useToast } from "../../../hooks/useToast";

import AyoBattleGroundUI from "./battleground/AyoBattleGroundUI";

type AyoIndexProps = {
  mode: "computer" | "online" | "battle";
};

export default function AyoIndex({ mode }: AyoIndexProps) {
  const { toast } = useToast();

  // Example toast usage for demonstration
  React.useEffect(() => {
    if (mode === "battle") {
      toast({ title: "Welcome!", description: "Battle mode started", type: "info" });
    }
  }, [mode]);

  if (mode === "computer") return <AyoComputerUI />;
  if (mode === "online") return <AyoOnlineUI />;
  return <AyoBattleGroundUI playerRank={1600} mStake={0} />;
}
