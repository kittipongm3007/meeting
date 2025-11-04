import ClientOnly from "./ClientOnly";
import MeetingPage from "./MeetingPage.client";

export default async function Page({
    params,
}: {
    params: Promise<{ roomId: string }>; // ใน Next รุ่นใหม่ params เป็น Promise
}) {
    const { roomId } = await params;     // ✅ ต้อง await
    return (
        <ClientOnly>
            <MeetingPage roomId={roomId} />
        </ClientOnly>
    );
}
