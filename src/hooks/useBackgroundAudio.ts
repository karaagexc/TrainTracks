import { useEffect, useRef, useState, useCallback } from 'react';
import { useTripStore } from '@/store/useTripStore';

// Silent WAV (1 second or loopable)
// This is a minimal WAV file with silence.
const SILENT_AUDIO_URI = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';

export function useBackgroundAudio() {
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    // We only want to play when a Trip is ACTIVE
    const { status } = useTripStore();

    // Initialize Audio Object
    useEffect(() => {
        const audio = new Audio(SILENT_AUDIO_URI);
        audio.loop = true;
        audio.volume = 0.01; // Almost silent but technically playing
        audioRef.current = audio;

        return () => {
            audio.pause();
            audioRef.current = null;
        };
    }, []);

    // Effect to start/stop based on Trip Status
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        // If Trip is ACTIVE (MOVING, DWELLING, WALKING, ARRIVED, TRANSIT?), we play.
        // If IDLE, we stop.
        const shouldPlay = status !== 'IDLE';

        if (shouldPlay && !isPlaying) {
            // Attempt to play
            // Note: This might fail if no user interaction preceded this state change.
            // Ideally, the state change comes from a button click ("Start Trip").
            audio.play().then(() => {
                console.log("Background Audio Logic: Started (Silent Loop)");
                setIsPlaying(true);
            }).catch(err => {
                console.warn("Background Audio Autoplay prevented:", err);
            });
        } else if (!shouldPlay && isPlaying) {
            audio.pause();
            setIsPlaying(false);
            console.log("Background Audio Logic: Stopped");
        }
    }, [status, isPlaying]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (audioRef.current) {
                audioRef.current.pause();
            }
        }
    }, []);

    return { isPlaying };
}
