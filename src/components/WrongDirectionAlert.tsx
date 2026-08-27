import { useEffect, useState } from 'react';
import { AlertTriangle, MapPin, Navigation } from 'lucide-react';
import { useWrongDirection } from '@/hooks/useWrongDirection';
import { useTripStore } from '@/store/useTripStore';

interface WrongDirectionAlertProps {
    onUpdateOrigin: () => void;
    onChangeDestination: () => void;
}

export function WrongDirectionAlert({ onUpdateOrigin, onChangeDestination }: WrongDirectionAlertProps) {
    const {
        isWrongWay,
        confidence,
        riskLevel,
        estimatedPenalty,
        reasons,
        nearestStationName,
        dismiss
    } = useWrongDirection();

    const [shouldRender, setShouldRender] = useState(false);
    const [isAnimating, setIsAnimating] = useState(false);

    const isActive = isWrongWay && confidence === 'HIGH';

    useEffect(() => {
        if (isActive) {
            setShouldRender(true);
            const timer = setTimeout(() => setIsAnimating(true), 50);
            return () => clearTimeout(timer);
        }

        setIsAnimating(false);
        const timer = setTimeout(() => setShouldRender(false), 500);
        return () => clearTimeout(timer);
    }, [isActive]);

    if (!shouldRender) return null;

    const tipText = riskLevel === 'SJT_MISMATCH'
        ? estimatedPenalty > 0
            ? `Your single-journey ticket may not be valid at the wrong exit. Estimated extra: PHP ${estimatedPenalty.toFixed(0)}`
            : 'Your single-journey ticket is only valid between your origin and destination.'
        : riskLevel === 'SVC_DEDUCTION'
            ? 'Your stored-value card will be charged based on where you exit.'
            : 'Get off at the next station and switch to the correct platform.';

    return (
        <div
            className={`fixed inset-0 z-[150] flex flex-col justify-end transition-all duration-500 ease-in-out ${isAnimating ? 'opacity-100' : 'opacity-0'}`}
        >
            <div
                className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                onClick={dismiss}
            />

            <div className={`relative mx-4 mb-4 transition-transform duration-500 ease-out ${isAnimating ? 'translate-y-0' : 'translate-y-full'}`}>
                <div className="bg-red-950/40 backdrop-blur-3xl border border-red-500/30 rounded-3xl shadow-[0_0_60px_-15px_rgba(239,68,68,0.6)] p-6 text-white max-w-md mx-auto relative overflow-hidden ring-1 ring-white/10">
                    <div className="absolute inset-0 bg-gradient-to-b from-red-500/10 to-transparent pointer-events-none" />

                    <div className="flex items-start gap-4 mb-5 relative z-10">
                        <div className="bg-red-500 text-white p-3 rounded-2xl shadow-lg shadow-red-500/20 animate-pulse shrink-0">
                            <AlertTriangle className="w-7 h-7 fill-current" />
                        </div>
                        <div className="flex-1">
                            <h3 className="text-xl font-bold text-white tracking-tight">
                                You may be going the wrong way
                            </h3>
                            <p className="text-sm text-red-200/80 font-medium leading-relaxed mt-1">
                                It looks like you&apos;re heading{' '}
                                <span className="text-white font-bold underline decoration-red-400 decoration-2 underline-offset-2">away</span>
                                {' '}from your destination.
                            </p>
                        </div>
                    </div>

                    <div className="bg-black/20 rounded-2xl px-4 py-3.5 border border-white/5 mb-5 relative z-10 backdrop-blur-sm">
                        <p className="text-xs text-zinc-300/90 leading-relaxed">
                            {tipText}
                        </p>
                        {riskLevel === 'SJT_MISMATCH' && estimatedPenalty > 0 && (
                            <p className="text-xs text-red-300 font-mono font-bold mt-2">
                                +PHP {estimatedPenalty.toFixed(0)} additional fare
                            </p>
                        )}
                    </div>

                    <div className="space-y-2.5 relative z-10">
                        <button
                            onClick={() => {
                                useTripStore.getState().setIgnoreWrongDirection(true);
                                dismiss();
                            }}
                            className="w-full bg-white/10 hover:bg-white/20 text-white font-semibold py-3.5 px-4 rounded-xl border border-white/15 active:scale-[0.97] transition-all flex items-center justify-center gap-3"
                        >
                            <Navigation className="w-4 h-4" />
                            <span className="text-sm">I&apos;m going the right way</span>
                        </button>

                        <button
                            onClick={() => {
                                onUpdateOrigin();
                                dismiss();
                            }}
                            className="w-full bg-red-500/80 hover:bg-red-500 text-white font-bold py-3.5 px-4 rounded-xl shadow-lg shadow-red-900/30 active:scale-[0.97] transition-all flex items-center justify-center gap-2.5"
                        >
                            <MapPin className="w-4 h-4" />
                            <span className="text-sm">
                                {nearestStationName ? `Fix my trip - I'm at ${nearestStationName}` : 'Fix my trip'}
                            </span>
                        </button>

                        <div className="flex items-center justify-between pt-1">
                            <button
                                onClick={() => {
                                    onChangeDestination();
                                    dismiss();
                                }}
                                className="text-red-200/50 text-[11px] hover:text-white/70 transition-colors active:scale-95"
                            >
                                I changed my destination
                            </button>
                            <button
                                onClick={dismiss}
                                className="text-red-200/50 text-[11px] hover:text-white/70 transition-colors active:scale-95"
                            >
                                Dismiss
                            </button>
                        </div>
                    </div>

                    <div className="absolute top-3 right-3 opacity-20 text-[8px] font-mono text-right pointer-events-none">
                        {reasons.map((reason, index) => <div key={index}>{reason}</div>)}
                    </div>
                </div>
            </div>
        </div>
    );
}
