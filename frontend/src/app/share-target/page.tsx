import { Suspense } from "react";
import { ShareTargetClient } from "./share-target-client";

function ShareTargetLoading() {
  return (
    <div className="min-h-screen bg-background p-4 sm:p-6">
      <div className="max-w-2xl mx-auto">
        <p className="text-sm text-muted-foreground">טוען נתוני שיתוף...</p>
      </div>
    </div>
  );
}

export default function ShareTargetPage() {
  return (
    <Suspense fallback={<ShareTargetLoading />}>
      <ShareTargetClient />
    </Suspense>
  );
}
