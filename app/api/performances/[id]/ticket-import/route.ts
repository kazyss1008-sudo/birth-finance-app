import { actorFor } from '@/lib/tickets/service';
import { importTicketCsv } from '@/lib/tickets/csv';
import { reply, failure, checkOrigin } from '@/lib/tickets/http';
import { TicketError } from '@/lib/tickets/domain';
export async function POST(req: Request, { params }: {
    params: Promise<{
        id: string;
    }>;
}) { try {
    checkOrigin(req);
    const pid = BigInt((await params).id);
    const actor = await actorFor(pid);
    if (actor.kind !== 'admin')
        throw new TicketError('管理者のみ取込できます', 403);
    const f = await req.formData();
    const file = f.get('file');
    if (!(file instanceof File) || file.size > 2000000)
        throw new TicketError('2MB以下のCSVを選んでください');
    const text = new TextDecoder(f.get('encoding') === 'utf-8' ? 'utf-8' : 'shift-jis').decode(await file.arrayBuffer());
    return reply(await importTicketCsv(pid, actor, text, String(f.get('source') ?? ''), String(f.get('token') ?? '') || undefined));
}
catch (e) {
    return failure(e);
} }
