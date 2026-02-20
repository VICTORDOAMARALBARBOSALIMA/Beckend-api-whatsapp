require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

console.log("Conectando na URL do Supabase:", process.env.SUPABASE_URL);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);


module.exports = supabase;