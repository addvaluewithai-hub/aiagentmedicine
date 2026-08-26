export function GET() {
  return Response.json({
    ok: true,
    service: 'medicine-agent-ai-gateway',
    aiConfigured: Boolean(process.env.AI_API)
  });
}
