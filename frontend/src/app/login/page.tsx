"use client";

/**
 * Login Page
 * 
 * Purpose: Authenticate users to access the admin dashboard.
 * Displays a login form and handles authentication.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { authApi, api } from "@/lib/api";
import { useToast } from "@/components/ui/use-toast";

export default function LoginPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !password) {
      toast({
        title: "שגיאה",
        description: "נא להזין אימייל וסיסמה",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    
    try {
      const response = await authApi.login(email, password);
      
      if (response.success && response.data) {
        api.setToken(response.data.token);
        toast({
          title: "התחברת בהצלחה",
          description: `שלום, ${response.data.user.name}`,
        });
        router.push("/dashboard");
      }
    } catch (error) {
      toast({
        title: "שגיאת התחברות",
        description: error instanceof Error ? error.message : "אימייל או סיסמה שגויים",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 to-primary/5 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 w-16 h-16 bg-primary rounded-full flex items-center justify-center">
            <span className="text-2xl text-white">👗</span>
          </div>
          <CardTitle className="text-2xl">ניהול עסק שמלות</CardTitle>
          <CardDescription>שמלות ערב - מערכת ניהול</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium">
                אימייל
              </label>
              <Input
                id="email"
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                dir="ltr"
                className="text-left"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium">
                סיסמה
              </label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                dir="ltr"
                className="text-left"
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "מתחבר..." : "התחבר"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
