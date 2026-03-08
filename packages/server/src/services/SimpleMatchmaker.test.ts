import { describe, expect, it } from 'vitest';
import { SimpleMatchmaker } from './SimpleMatchmaker.js';

type QueueEntry = {
    id: string;
    leaderId: string;
    members: string[];
    mode: '4v4';
    ruleset: 'casual';
    transport: 'socket';
    walletKeys: Record<string, string | undefined>;
    selectedLoadoutSlotByPlayer: Record<string, number>;
    playerLoadouts: Record<string, { slotIndex: number; characterModelId: string; weaponModelId: string }>;
    enqueuedAt: number;
};

function createQueueEntry(id: string, members: string[], enqueuedAt: number): QueueEntry {
    return {
        id,
        leaderId: members[0]!,
        members,
        mode: '4v4',
        ruleset: 'casual',
        transport: 'socket',
        walletKeys: Object.fromEntries(members.map((member) => [member, undefined])),
        selectedLoadoutSlotByPlayer: Object.fromEntries(members.map((member) => [member, 0])),
        playerLoadouts: Object.fromEntries(
            members.map((member) => [
                member,
                { slotIndex: 0, characterModelId: 'assasin', weaponModelId: 'smg1' },
            ]),
        ),
        enqueuedAt,
    };
}

describe('SimpleMatchmaker', () => {
    it('skips exact subsets that cannot be partitioned into legal teams', () => {
        const matchmaker = new SimpleMatchmaker() as any;
        const queueEntries: QueueEntry[] = [
            createQueueEntry('trio-1', ['p1', 'p2', 'p3'], 1),
            createQueueEntry('trio-2', ['p4', 'p5', 'p6'], 2),
            createQueueEntry('duo-1', ['p7', 'p8'], 3),
            createQueueEntry('party-4', ['p9', 'p10', 'p11', 'p12'], 4),
            createQueueEntry('duo-2', ['p13', 'p14'], 5),
        ];

        matchmaker.queueEntries = queueEntries;
        matchmaker.queueByPlayer = new Map(
            queueEntries.flatMap((entry) => entry.members.map((member) => [member, entry.id])),
        );

        matchmaker.checkQueue();

        expect(matchmaker.matches.size).toBe(1);
        const [match] = Array.from(matchmaker.matches.values());
        expect(match.players).toHaveLength(8);
        expect(match.players).toEqual(
            expect.arrayContaining(['p7', 'p8', 'p9', 'p10', 'p11', 'p12', 'p13', 'p14']),
        );
        expect(match.players).not.toEqual(expect.arrayContaining(['p1', 'p2', 'p3', 'p4', 'p5', 'p6']));
        expect(match.teamA).toHaveLength(4);
        expect(match.teamB).toHaveLength(4);
    });
});
