"use client";

import dynamic from 'next/dynamic';

import { LoadingScreen } from '@/components/ui/LoadingScreen';

const MainApp = dynamic(() => import('@/components/MainApp'), {
  ssr: false,
  loading: () => <LoadingScreen />
});

export default function Home() {
  return <MainApp />;
}
