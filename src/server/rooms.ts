// src/server/rooms.ts
export type RoomId = string;
export type UserId = string;

/** ใช้รูปแบบที่เทียบเท่า RTCSessionDescriptionInit โดยไม่พึ่ง DOM lib ในฝั่ง Node */
export type SdpInit = {
    type: "offer" | "answer";
    sdp: string;
};

/** ใช้รูปแบบที่เทียบเท่า RTCIceCandidateInit (ปลอด DOM) */
export type IceInit = {
    candidate: string;
    sdpMid?: string | null;
    sdpMLineIndex?: number | null;
    usernameFragment?: string | null;
};

/** อีเวนต์ทั้งหมดที่วิ่งในห้อง (ติด roomId ทุกตัว) */
export type SignalEvent =
    | { type: "offer"; roomId: RoomId; from: UserId; to: UserId; sdp: SdpInit }
    | { type: "answer"; roomId: RoomId; from: UserId; to: UserId; sdp: SdpInit }
    | { type: "ice"; roomId: RoomId; from: UserId; to: UserId; candidate: IceInit }
    | { type: "peer-joined"; roomId: RoomId; userId: UserId }
    | { type: "peer-left"; roomId: RoomId; userId: UserId };

type Room = {
    users: Set<UserId>;
    listeners: Set<(evt: SignalEvent) => void>; // callbacks ของผู้ subscribe ห้องนี้
};

class RoomStore {
    private rooms = new Map<RoomId, Room>();

    private ensure(roomId: RoomId): Room {
        let room = this.rooms.get(roomId);
        if (!room) {
            room = { users: new Set(), listeners: new Set() };
            this.rooms.set(roomId, room);
        }
        return room;
    }

    /** แค่เพิ่มผู้ใช้ในห้อง (ไม่ broadcast เพื่อกันซ้ำ; ให้ router เป็นคน emit) */
    join(roomId: RoomId, userId: UserId) {
        const room = this.ensure(roomId);
        room.users.add(userId);
    }

    /** แค่ลบผู้ใช้ (ไม่ broadcast เพื่อกันซ้ำ; ให้ router เป็นคน emit) */
    leave(roomId: RoomId, userId: UserId) {
        const room = this.ensure(roomId);
        room.users.delete(userId);
        // cleanup ถ้าไม่มีผู้ใช้และไม่มีผู้ฟัง
        if (room.users.size === 0 && room.listeners.size === 0) {
            this.rooms.delete(roomId);
        }
    }

    /** สมัครฟังอีเวนต์ของห้อง */
    on(roomId: RoomId, cb: (evt: SignalEvent) => void) {
        const room = this.ensure(roomId);
        room.listeners.add(cb);
        return () => {
            room.listeners.delete(cb);
            if (room.users.size === 0 && room.listeners.size === 0) {
                this.rooms.delete(roomId);
            }
        };
    }

    /** กระจายอีเวนต์ให้ผู้ฟังทั้งหมดของห้อง */
    broadcast(roomId: RoomId, evt: SignalEvent) {
        const room = this.ensure(roomId);
        for (const cb of room.listeners) cb(evt);
    }

    /**
     * ส่งอีเวนต์แบบมี to/จาก (ยังคง broadcast ให้ทุก listener แล้วให้ client กรอง msg.to เอง)
     * สะดวกสำหรับ tRPC subscription ที่ไม่มี session mapping ต่อ listener
     */
    direct(roomId: RoomId, evt: Extract<SignalEvent, { to: UserId }>) {
        const room = this.ensure(roomId);
        for (const cb of room.listeners) cb(evt);
    }

    /** รายชื่อผู้ใช้ในห้อง */
    peers(roomId: RoomId) {
        const room = this.ensure(roomId);
        return Array.from(room.users);
    }

    /** helper: มีผู้ใช้อยู่ในห้องนี้ไหม */
    hasUser(roomId: RoomId, userId: UserId) {
        const room = this.ensure(roomId);
        return room.users.has(userId);
    }

    /** helper: จำนวนผู้ใช้งานในห้อง */
    size(roomId: RoomId) {
        const room = this.ensure(roomId);
        return room.users.size;
    }
}

export const roomStore = new RoomStore();
