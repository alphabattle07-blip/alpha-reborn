import { store, persistor } from '../src/store';
import { PersistGate } from 'redux-persist/integration/react';
import { Provider } from 'react-redux';
import { useEffect, useState } from 'react';
import { loadToken } from '../src/store/thunks/authThunks';
import { AppDispatch } from '../src/store';
import { useDispatch } from 'react-redux';
import LoadingSpinner from '../src/components/LoadingSpinner';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { NavigationContainer } from '@react-navigation/native';
import RootNavigator from '../src/navigation/RootNavigator';
import { WalletProvider } from '../src/assets/screens/wallet/WalletContext';
import Toast from 'react-native-toast-message';

function AppContent() {
    const dispatch = useDispatch<AppDispatch>();
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const loadApp = async () => {
            await dispatch(loadToken());
            setIsLoading(false);
        };
        loadApp();
    }, [dispatch]);

    if (isLoading) {
        return <LoadingSpinner />;
    }

    return (
        <NavigationContainer independent={true}>
            <WalletProvider>
                <RootNavigator />
            </WalletProvider>
            <Toast />
        </NavigationContainer>
    );
}

export default function RootLayout() {
    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <Provider store={store}>
                <PersistGate loading={null} persistor={persistor}>
                    <AppContent />
                </PersistGate>
            </Provider>
        </GestureHandlerRootView>
    );
}
