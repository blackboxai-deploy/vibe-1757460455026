"use client";

import SpaceGame from "@/components/SpaceGame";

export default function Home() {
  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <div className="w-full max-w-6xl">
        <div className="text-center mb-6">
          <h1 className="text-4xl font-bold text-white mb-2 tracking-wider">
            SPACE DEFENDER
          </h1>
          <p className="text-gray-400 text-lg">
            Defend Earth from the alien invasion!
          </p>
        </div>
        
        <div className="flex justify-center">
          <SpaceGame />
        </div>
        
        <div className="text-center mt-6 text-gray-500">
          <p className="mb-2">Controls: WASD to move • SPACE to shoot • P to pause</p>
          <p>Collect power-ups and survive as long as possible!</p>
        </div>
      </div>
    </div>
  );
}