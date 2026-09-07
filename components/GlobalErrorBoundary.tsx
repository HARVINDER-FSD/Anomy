import React, { Component, ErrorInfo, ReactNode } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Updates from 'expo-updates';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class GlobalErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('🔥 [GLOBAL ERROR BOUNDARY CAUGHT ERROR]:', error);
    console.error('🔥 [ERROR STACK]:', error?.stack);
    console.error('🔥 [COMPONENT STACK]:', errorInfo?.componentStack);
  }

  private async handleReload(): Promise<void> {
    try {
      await Updates.reloadAsync();
    } catch (e) {
      // Fallback if Updates API is not available
      this.setState({ hasError: false, error: null });
    }
  }

  public render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <Ionicons name="warning-outline" size={56} color="#ff4444" />
          <Text style={styles.title}>Oops! An Error Occurred</Text>
          <Text style={styles.subtitle}>
            An unhandled error was caught by the Error Boundary.
          </Text>
          
          <View style={styles.errorBox}>
            <Text style={styles.errorTextTitle}>{this.state.error?.name || 'Error'}: {this.state.error?.message}</Text>
            {this.state.error?.stack ? (
              <Text style={styles.errorStack} numberOfLines={8}>
                {this.state.error.stack}
              </Text>
            ) : null}
          </View>

          <TouchableOpacity style={styles.button} onPress={this.handleReload}>
            <Text style={styles.buttonText}>Restart App</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1a1a1a',
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    fontWeight: '400',
    color: '#666',
    textAlign: 'center',
    marginBottom: 32,
  },
  errorBox: {
    width: '100%',
    backgroundColor: '#FFF0F0',
    borderColor: '#FFD2D2',
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 24,
  },
  errorTextTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#D32F2F',
    marginBottom: 6,
  },
  errorStack: {
    fontSize: 11,
    color: '#7F1D1D',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    lineHeight: 16,
  },
  button: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 30,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});

