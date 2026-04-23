// core/whotConfig.ts
// (This is the new file you need to create)

/**
 * Standard dimensions for a playing card in this game.
 * All layout calculations (coordinateHelper, styles, etc.)
 * should import from this file to stay consistent.
 */
export const CARD_WIDTH = 60;
export const CARD_HEIGHT = 90;

// Portrait Layout Constants (Shared between UI and coordinateHelper)
export const PORTRAIT_PLAYER_BOTTOM_MARGIN = 100;
export const PORTRAIT_COMPUTER_TOP_MARGIN = 40;
export const HAND_CONTAINER_HEIGHT = CARD_HEIGHT + 10;

// Opponent Profile Layout (Portrait)
export const PORTRAIT_COMPUTER_HAND_LEFT_MARGIN = 125;
export const PORTRAIT_COMPUTER_CONTAINER_LEFT = 110;
export const PORTRAIT_OPPONENT_PROFILE_TOP = 45;
