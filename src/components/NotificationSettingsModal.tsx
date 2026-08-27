
import { useState, useEffect } from 'react';
import { useTripStore } from '@/store/useTripStore';
import { Bell, MapPin, BellOff, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { cn } from '@/lib/utils';
import { getThemeColors } from '@/utils/stationUtils';

export default function NotificationSettingsModal() {
    const { notificationPreference, setNotificationPreference, origin } = useTripStore();
    const [isOpen, setIsOpen] = useState(false);
    const [permission, setPermission] = useState<NotificationPermission>('default');

    useEffect(() => {
        if (typeof window !== 'undefined' && 'Notification' in window) {
            setPermission(Notification.permission);
        }
    }, [isOpen]);

    const handleSelect = async (pref: 'all' | 'destination' | 'none') => {
        setNotificationPreference(pref);

        if (pref !== 'none') {
            if (typeof window !== 'undefined' && 'Notification' in window) {
                if (Notification.permission === 'default') {
                    const result = await Notification.requestPermission();
                    setPermission(result);
                } else if (Notification.permission === 'denied') {
                    // Logic to show instruction is handled in render
                }
            }
        }
        // Don't close immediately if permission is needed, but for now we close
        setIsOpen(false);
    };

    // Determine Dynamic Color based on Line
    const theme = getThemeColors(origin?.lineId);

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                        "rounded-full transition-all duration-300",
                        notificationPreference === 'none'
                            ? "text-zinc-500 bg-zinc-800/50"
                            : cn(theme.text, theme.bg, "hover:bg-opacity-20")
                    )}
                >
                    {notificationPreference === 'all' && <Bell className={cn("w-6 h-6 animate-pulse", theme.icon)} />}
                    {notificationPreference === 'destination' && <MapPin className={cn("w-6 h-6", theme.icon)} />}
                    {notificationPreference === 'none' && <BellOff className="w-6 h-6" />}
                </Button>
            </DialogTrigger>
            <DialogContent className="bg-zinc-950 border-zinc-800 text-white sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="text-xl font-bold flex items-center gap-2">
                        <Bell className={cn("w-6 h-6", theme.icon)} />
                        Never miss a station!
                    </DialogTitle>
                </DialogHeader>

                {/* Permission Status Alert */}
                {permission === 'denied' && (
                    <div className="bg-red-500/10 border border-red-500/20 p-3 rounded-lg flex items-start gap-3">
                        <AlertTriangle className="w-5 h-5 text-red-500 mt-0.5" />
                        <div>
                            <p className="text-sm font-bold text-red-400">Notifications Blocked</p>
                            <p className="text-xs text-zinc-400 leading-relaxed">
                                Please enable notifications for this site in your browser settings to receive alerts.
                            </p>
                        </div>
                    </div>
                )}

                {permission === 'granted' && notificationPreference !== 'none' && (
                    <div className={cn("border p-3 rounded-lg flex items-center gap-3", theme.bg, theme.border)}>
                        <CheckCircle2 className={cn("w-5 h-5", theme.text)} />
                        <p className={cn("text-sm font-bold", theme.text)}>Notifications Active</p>
                    </div>
                )}


                <div className="grid gap-3 py-2">
                    <button
                        onClick={() => handleSelect('all')}
                        className={cn(
                            "flex items-center gap-4 p-4 rounded-xl border text-left transition-all group",
                            notificationPreference === 'all'
                                ? cn(theme.border, theme.bg, theme.shadow)
                                : "border-zinc-800 hover:bg-zinc-900"
                        )}
                    >
                        <div className={cn("p-3 rounded-full", notificationPreference === 'all' ? theme.bg : "bg-zinc-900", theme.text)}>
                            <Bell className="w-6 h-6" />
                        </div>
                        <div>
                            <h3 className={cn("font-bold text-lg group-hover:text-white transition-colors", notificationPreference === 'all' ? "text-white" : "text-zinc-300")}>
                                Every Station
                            </h3>
                            <p className="text-sm text-zinc-500 group-hover:text-zinc-400">Alerts for approaching, transfer, and arrival.</p>
                        </div>
                    </button>

                    <button
                        onClick={() => handleSelect('destination')}
                        className={cn(
                            "flex items-center gap-4 p-4 rounded-xl border text-left transition-all group",
                            notificationPreference === 'destination'
                                ? cn(theme.border, theme.bg, theme.shadow)
                                : "border-zinc-800 hover:bg-zinc-900"
                        )}
                    >
                        <div className={cn("p-3 rounded-full", notificationPreference === 'destination' ? theme.bg : "bg-zinc-900", theme.text)}>
                            <MapPin className="w-6 h-6" />
                        </div>
                        <div>
                            <h3 className={cn("font-bold text-lg group-hover:text-white transition-colors", notificationPreference === 'destination' ? "text-white" : "text-zinc-300")}>
                                Destination Only
                            </h3>
                            <p className="text-sm text-zinc-500 group-hover:text-zinc-400">Wake me up only when I arrive.</p>
                        </div>
                    </button>

                    <button
                        onClick={() => handleSelect('none')}
                        className={cn(
                            "flex items-center gap-4 p-4 rounded-xl border text-left transition-all group",
                            notificationPreference === 'none'
                                ? "border-red-500/50 bg-red-500/10 shadow-[0_0_15px_rgba(239,68,68,0.2)]"
                                : "border-zinc-800 hover:bg-zinc-900"
                        )}
                    >
                        <div className={cn("p-3 rounded-full", notificationPreference === 'none' ? "bg-red-500/10 text-red-400" : "bg-zinc-900 text-zinc-500")}>
                            <BellOff className="w-6 h-6" />
                        </div>
                        <div>
                            <h3 className={cn("font-bold text-lg group-hover:text-white transition-colors", notificationPreference === 'none' ? "text-white" : "text-zinc-300")}>
                                Mute All
                            </h3>
                            <p className="text-sm text-zinc-500 group-hover:text-zinc-400">Silence. I know the way.</p>
                        </div>
                    </button>
                </div>

                {/* Explicit Enable Button for Default State */}
                {permission === 'default' && (
                    <div className="pt-2 border-t border-zinc-900 mt-2">
                        <Button
                            className={cn("w-full font-bold", theme.bg, theme.text)}
                            onClick={async () => {
                                const result = await Notification.requestPermission();
                                setPermission(result);
                                if (result === 'granted' && notificationPreference === 'none') {
                                    setNotificationPreference('all');
                                }
                            }}
                        >
                            Enable Notifications
                        </Button>
                        <p className="text-xs text-zinc-500 text-center mt-2">
                            Browser needs permission to show alerts.
                        </p>
                    </div>
                )}
            </DialogContent>
        </Dialog >
    );
}
