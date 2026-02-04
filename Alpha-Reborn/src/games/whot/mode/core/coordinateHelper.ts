import { CARD_WIDTH, CARD_HEIGHT } from "./ui/whotConfig";

type Target = "player" | "computer" | "pile" | "market";
interface CoordsOptions {
  cardIndex?: number;
  handSize?: number;
}

export const getCoords = (
  target: Target,
  options: CoordsOptions = {},
  screenWidth: number,
  screenHeight: number
): { x: number; y: number; rotation: number } => {
  "worklet";
  const { cardIndex = 0, handSize = 1 } = options;
  const isLandscape = screenWidth > screenHeight;

  const deckCenterX = screenWidth / 2;
  const deckCenterY = isLandscape ? screenHeight / 2.2 : screenHeight / 2;
  // deckCenterX = screenWidth / 2;
  // deckCenterY = screenHeight / 2;

  switch (target) {
    // --- PILE (Played Cards) ---
    case "pile":
      return {
        x: deckCenterX + CARD_WIDTH * 0.7,
        y: isLandscape ? deckCenterY : screenHeight * 0.45,
        rotation: 0,
      };

    // --- MARKET (Draw Pile) ---
    case "market":
      if (isLandscape) {
        return {
          x: deckCenterX - CARD_WIDTH * 2,
          y: deckCenterY + 8,
          rotation: 0,
        };
      }
      return {
        x: deckCenterX - CARD_WIDTH * 0.7,
        y: deckCenterY,
        rotation: 0,
      };

    // --- COMPUTER (Top Hand) ---
    case "computer": {
      const boxTopMargin = isLandscape ? 10 : 20;
      const boxHeight = CARD_HEIGHT + 10;

      // Correct Y for each orientation
      const y = isLandscape
        ? boxTopMargin + boxHeight / 2.1 // landscape
        : boxTopMargin + boxHeight / 1.5; // portrait

      const maxCardsBeforeSqueeze = 6;

      if (isLandscape) {
        const defaultSpacing = 5;
        const maxAllowedWidth =
          CARD_WIDTH + (maxCardsBeforeSqueeze - 1) * (CARD_WIDTH + defaultSpacing);

        let visualWidth = CARD_WIDTH + defaultSpacing;
        let totalWidth = handSize * visualWidth - defaultSpacing;

        if (handSize > maxCardsBeforeSqueeze) {
          totalWidth = maxAllowedWidth;
          visualWidth = (maxAllowedWidth - CARD_WIDTH) / (handSize - 1);
        }

        // Fixed: Ensure division by 2 is present
        const startX = (screenWidth - totalWidth) / 2;
        const x = startX + cardIndex * visualWidth + CARD_WIDTH / 2;

        return { x, y, rotation: 0 };
      } else {
        // --- FIXED PORTRAIT LOGIC ---

        // 1. Define a fixed starting point on the left (Fixed 0 Index)
        // UPDATED: Fixed margin as requested
        const startMargin = 110;

        // 2. Define the maximum width available before squeezing
        // We leave a matching margin on the right side to keep it balanced visually
        const maxAllowedWidth = screenWidth - (startMargin * 1.2);

        // 3. Calculate spacing (Visual Width)
        const defaultSpacing = CARD_WIDTH * 0.9;
        let visualWidth = defaultSpacing;

        // Calculate how wide the hand WOULD be without squeezing
        const potentialWidth = CARD_WIDTH + (handSize - 1) * defaultSpacing;

        // If hand exceeds width, recalculate spacing to squeeze
        if (potentialWidth > maxAllowedWidth && handSize > 1) {
          visualWidth = (maxAllowedWidth - CARD_WIDTH) / (handSize - 1);
        }

        // 4. Position Calculation
        // The 0-index card stays at startMargin. Subsequent cards grow rightward.
        const x = startMargin + (cardIndex * visualWidth) + (CARD_WIDTH / 2);

        return { x, y, rotation: 0 };
      }
    }

    // --- PLAYER (Bottom Hand) ---
    case "player": {
      const boxBottomMargin = isLandscape ? 10 : 20;
      const boxHeight = CARD_HEIGHT + 10;
      const y = screenHeight - boxBottomMargin - boxHeight / 1.4; // height of the card in landscape

      if (isLandscape) {
        const spacing = 5;
        const visualWidth = CARD_WIDTH + spacing;
        const totalWidth = handSize * visualWidth - spacing;
        const startX = (screenWidth - totalWidth) / 2;
        const x = startX + cardIndex * visualWidth + CARD_WIDTH / 1; // width of the card in landscape
        return { x, y, rotation: 0 };
      } else {
        // Player Squeezing logic (unchanged)
        const maxPlayerWidth = screenWidth * 0.9;
        const defaultVisualWidth = CARD_WIDTH * 0.6;
        let totalWidth = CARD_WIDTH + (handSize - 1) * defaultVisualWidth;
        let visualWidth = defaultVisualWidth;

        if (totalWidth > maxPlayerWidth && handSize > 1) {
          visualWidth = (maxPlayerWidth - CARD_WIDTH) / (handSize - 1);
          totalWidth = maxPlayerWidth;
        }
        const startX = (screenWidth - totalWidth) / 2;
        const x = startX + cardIndex * visualWidth + CARD_WIDTH / 6;
        return { x, y, rotation: 0 };
      }
    }

    default:
      return { x: screenWidth / 2, y: screenHeight / 2, rotation: 0 };
  }
};