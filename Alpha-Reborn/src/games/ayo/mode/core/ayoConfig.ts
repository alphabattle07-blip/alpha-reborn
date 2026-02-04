export const AYO_BOARD_CONFIG = {
    // Portrait Orientation Settings
    portrait: {
        // How much of the screen width the board should take (0.0 to 1.0)
        widthMultiplier: 0.95,
        // External margins for the board container
        margins: {
            marginTop: 0,
            marginBottom: 0,
            marginLeft: 0,
            marginRight: 0,
        },
    },
    // Landscape Orientation Settings
    landscape: {
        // How much of the screen height the board should take (0.0 to 1.0)
        heightMultiplier: 0.65,
        // Maximum screen width percentage the board can occupy in landscape
        maxWidthMultiplier: 0.9,
        // External margins for the board container
        margins: {
            marginTop: "2%",
            marginBottom: 0,
            marginLeft: "10%",
            marginRight: "10%",
        },
    },
};
