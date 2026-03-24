import { handleCycle } from './handlers/cycle.js';
import { handleHistory } from './handlers/history.js';

const router = {
    async handle(request, env) {
        const url = new URL(request.url);
        const path = url.pathname;

        if (path === '/api/v1/cycle/current') {
            return await handleCycle(request, env);
        } else if (path === '/api/v1/history') {
            return await handleHistory(request, env);
        }

        return new Response(JSON.stringify({ error: 'Not Found' }), {
            status: 404,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            },
        });
    },
};

export default router;
