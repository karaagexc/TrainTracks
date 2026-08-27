"use client";

import { Component, ErrorInfo, ReactNode } from "react";

interface Props {
    children?: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error("Uncaught error:", error, errorInfo);
    }

    public render() {
        if (this.state.hasError) {
            return (
                <div style={{
                    minHeight: '100vh',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '24px',
                    backgroundColor: '#7f1d1d', // red-900
                    color: 'white',
                    textAlign: 'center',
                    fontFamily: 'sans-serif'
                }} className="min-h-screen flex flex-col items-center justify-center p-6 bg-red-900 text-white text-center">
                    <h1 className="text-3xl font-bold mb-4">Something went wrong</h1>
                    <pre style={{
                        backgroundColor: 'rgba(0,0,0,0.5)',
                        padding: '16px',
                        borderRadius: '4px',
                        textAlign: 'left',
                        overflow: 'auto',
                        maxWidth: '100%',
                        fontSize: '12px'
                    }} className="bg-black/50 p-4 rounded text-left overflow-auto max-w-full text-xs">
                        {this.state.error?.toString()}
                    </pre>
                    <button
                        onClick={() => window.location.reload()}
                        style={{
                            marginTop: '24px',
                            padding: '8px 16px',
                            backgroundColor: 'white',
                            color: 'black',
                            fontWeight: 'bold',
                            borderRadius: '4px',
                            border: 'none',
                            cursor: 'pointer'
                        }}
                        className="mt-6 px-4 py-2 bg-white text-black font-bold rounded"
                    >
                        Reload
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}
