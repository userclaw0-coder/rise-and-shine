import { useAuth } from "../hooks/useAuth";
import DashboardLayout from "../components/DashboardLayout";
import ChatPanel from "../components/ChatPanel";

export default function ChatPage() {
  const { user, isCheckingAuth } = useAuth();

  if (isCheckingAuth || !user) return null;

  return (
    <DashboardLayout>
      <div className="jarvis-page-wrap">
        <ChatPanel isOverlay={false} isOpen />
      </div>
    </DashboardLayout>
  );
}
