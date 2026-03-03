import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface SoundState {
    whot: {
        voice: boolean;
        sfx: boolean;
        bgm: boolean;
    };
    ludo: {
        sfx: boolean;
        bgm: boolean;
    };
}

const initialState: SoundState = {
    whot: {
        voice: true,
        sfx: true,
        bgm: true,
    },
    ludo: {
        sfx: true,
        bgm: true,
    }
};

export const soundSettingsSlice = createSlice({
    name: 'soundSettings',
    initialState,
    reducers: {
        toggleSound: (
            state,
            action: PayloadAction<{ game: 'whot' | 'ludo'; setting: 'voice' | 'sfx' | 'bgm' }>
        ) => {
            const { game, setting } = action.payload;
            // @ts-ignore - Dynamic key access based on literal types
            if (state[game] && state[game][setting] !== undefined) {
                // @ts-ignore
                state[game][setting] = !state[game][setting];
            }
        },
        setSound: (
            state,
            action: PayloadAction<{ game: 'whot' | 'ludo'; setting: 'voice' | 'sfx' | 'bgm', value: boolean }>
        ) => {
            const { game, setting, value } = action.payload;
            // @ts-ignore
            if (state[game] && state[game][setting] !== undefined) {
                // @ts-ignore
                state[game][setting] = value;
            }
        },
        toggleAllSounds: (state, action: PayloadAction<{ game: 'whot' | 'ludo' }>) => {
            const { game } = action.payload;
            const settings = state[game];

            // If ALL are false, we unmute them all. Otherwise, we mute them all.
            const allMuted = Object.values(settings).every((val) => val === false);
            const newValue = allMuted ? true : false;

            Object.keys(settings).forEach((key) => {
                // @ts-ignore
                settings[key] = newValue;
            });
        }
    }
});

export const { toggleSound, setSound, toggleAllSounds } = soundSettingsSlice.actions;

export default soundSettingsSlice.reducer;
