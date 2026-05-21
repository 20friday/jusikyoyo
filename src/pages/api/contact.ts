import type { APIRoute } from 'astro';
import { Resend } from 'resend';

const TYPE_LABELS: Record<string, string> = {
  service: '서비스 문의',
  content: '콘텐츠 제안',
};

export const POST: APIRoute = async ({ locals, request }) => {
  if (!locals.session || !locals.user) {
    return new Response('Unauthorized', { status: 401 });
  }

  let body: { type?: string; title?: string; content?: string };
  try {
    body = await request.json();
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  const { type, title, content } = body;
  if (!type || !['service', 'content'].includes(type)) {
    return new Response('type은 service 또는 content여야 해요', { status: 400 });
  }
  if (!title?.trim()) {
    return new Response('제목을 입력해주세요', { status: 400 });
  }
  if (!content?.trim()) {
    return new Response('내용을 입력해주세요', { status: 400 });
  }

  const email = locals.user.email ?? '';
  const userId = locals.user.id;

  const { error: dbError } = await locals.supabase.from('inquiries').insert({
    user_id: userId,
    email,
    type,
    title: title.trim(),
    content: content.trim(),
  });

  if (dbError) {
    console.error('inquiries insert error:', dbError.message);
    return new Response('저장 중 오류가 발생했어요', { status: 500 });
  }

  try {
    const resend = new Resend(import.meta.env.RESEND_API_KEY);
    const typeLabel = TYPE_LABELS[type] ?? type;
    const submittedAt = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });

    await resend.emails.send({
      from: 'TED PICK <onboarding@resend.dev>',
      to: ['20friday@gmail.com'],
      subject: `[테드픽 문의] ${typeLabel} — ${title.trim()}`,
      html: `
        <p><strong>유형:</strong> ${typeLabel}</p>
        <p><strong>보낸 사람:</strong> ${email}</p>
        <p><strong>제목:</strong> ${title.trim()}</p>
        <hr />
        <p style="white-space:pre-wrap;">${content.trim()}</p>
        <hr />
        <p style="color:#888;font-size:12px;">접수 시각: ${submittedAt}</p>
      `,
    });
  } catch (emailErr) {
    console.error('resend error:', emailErr);
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
