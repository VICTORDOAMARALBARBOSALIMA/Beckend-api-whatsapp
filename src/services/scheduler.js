const supabase = require('../config/db');
const { client } = require('../config/whatsapp');

function formatarMensagem(template, agendamento) {
    if (!template) return "Olá! Passando para lembrar da sua consulta.";
    const dataObj = new Date(agendamento.data_hora);
    return template
        .replace(/{nome}/g, agendamento.paciente_nome)
        .replace(/{data}/g, dataObj.toLocaleDateString('pt-BR'))
        .replace(/{hora}/g, dataObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
        .replace(/{profissional}/g, agendamento.profissional_nome || "Equipe FormulaPé");
}

const verificarEEnviarTudo = async () => {
    console.log("--- 🕵️ VIGIA FORMULAPÉ EM AÇÃO ---");
    const agora = new Date();
    const limiteAmanha = new Date(agora.getTime() + (24 * 60 * 60 * 1000)); // +24h

    try {
        const { data: templates } = await supabase.from('templates').select('*');

        // --- LÓGICA 1: LEMBRETE 24H ANTES ---
        const { data: lembretes } = await supabase.from('agendamentos')
            .select('*')
            .eq('status_lembrete_24h', 'pendente')
            .lte('data_hora', limiteAmanha.toISOString()) // Consulta é em até 24h
            .gt('data_hora', agora.toISOString());        // Mas ainda não aconteceu

        if (lembretes?.length > 0) {
            const tplLembrete = templates?.find(t => t.slug === 'lembrete_24h')?.conteudo;
            for (let ag of lembretes) {
                const msg = formatarMensagem(tplLembrete, ag);
                await client.sendMessage(`${ag.whatsapp.replace(/\D/g, '')}@c.us`, msg);
                await supabase.from('agendamentos').update({ status_lembrete_24h: 'enviado' }).eq('id', ag.id);
                console.log(`✅ Lembrete 24h enviado: ${ag.paciente_nome}`);
            }
        }

        // --- LÓGICA 2: PÓS-CONSULTA ---
        const { data: pos } = await supabase.from('agendamentos')
            .select('*')
            .eq('status_pos_consulta', 'pendente')
            .lt('data_hora', agora.toISOString()); // Consulta já passou

        if (pos?.length > 0) {
            const tplPos = templates?.find(t => t.slug === 'pos_consulta')?.conteudo;
            for (let ag of pos) {
                const msg = formatarMensagem(tplPos, ag);
                await client.sendMessage(`${ag.whatsapp.replace(/\D/g, '')}@c.us`, msg);
                await supabase.from('agendamentos').update({ status_pos_consulta: 'enviado' }).eq('id', ag.id);
                console.log(`✅ Pós-consulta enviado: ${ag.paciente_nome}`);
            }
        }

    } catch (err) {
        console.error("❌ Erro no Vigia:", err.message);
    }
};

module.exports = { verificarEEnviarTudo };