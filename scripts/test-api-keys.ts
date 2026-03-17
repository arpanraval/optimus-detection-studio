/**
 * API Key Test Script
 * Run with: npx tsx scripts/test-api-keys.ts
 *
 * Tests: Gemini, Tavily, and Anthropic API keys
 */

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const TAVILY_API_KEY = process.env.TAVILY_API_KEY || '';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';

async function testGemini(): Promise<{ success: boolean; message: string }> {
  if (!GEMINI_API_KEY) {
    return { success: false, message: 'GEMINI_API_KEY not set in environment' };
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'models/gemini-embedding-001',
          content: { parts: [{ text: 'test embedding' }] },
          taskType: 'RETRIEVAL_QUERY',
          outputDimensionality: 256
        })
      }
    );

    if (!response.ok) {
      const error = await response.text();
      return { success: false, message: `Gemini API error: ${error}` };
    }

    const data = await response.json();
    if (data.embedding?.values?.length > 0) {
      return { success: true, message: `Gemini OK - Generated ${data.embedding.values.length}-dim embedding` };
    }
    return { success: false, message: 'Gemini returned unexpected response' };
  } catch (e: any) {
    return { success: false, message: `Gemini error: ${e.message}` };
  }
}

async function testTavily(): Promise<{ success: boolean; message: string }> {
  if (!TAVILY_API_KEY) {
    return { success: false, message: 'TAVILY_API_KEY not set in environment' };
  }

  try {
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: TAVILY_API_KEY,
        query: 'MITRE ATT&CK',
        search_depth: 'basic',
        max_results: 1
      })
    });

    if (!response.ok) {
      const error = await response.text();
      return { success: false, message: `Tavily API error: ${error}` };
    }

    const data = await response.json();
    if (data.results?.length > 0) {
      return { success: true, message: `Tavily OK - Found ${data.results.length} result(s)` };
    }
    return { success: false, message: 'Tavily returned no results' };
  } catch (e: any) {
    return { success: false, message: `Tavily error: ${e.message}` };
  }
}

async function testAnthropic(): Promise<{ success: boolean; message: string }> {
  if (!ANTHROPIC_API_KEY) {
    return { success: false, message: 'ANTHROPIC_API_KEY not set in environment' };
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Say "OK"' }]
      })
    });

    if (!response.ok) {
      const error = await response.text();
      return { success: false, message: `Anthropic API error: ${error}` };
    }

    const data = await response.json();
    if (data.content?.[0]?.text) {
      return { success: true, message: `Anthropic OK - Response: "${data.content[0].text.trim()}"` };
    }
    return { success: false, message: 'Anthropic returned unexpected response' };
  } catch (e: any) {
    return { success: false, message: `Anthropic error: ${e.message}` };
  }
}

async function main() {
  console.log('\n🔑 Testing API Keys...\n');
  console.log('─'.repeat(50));

  // Test Gemini
  process.stdout.write('Testing Gemini (Embeddings)... ');
  const geminiResult = await testGemini();
  console.log(geminiResult.success ? '✅' : '❌');
  console.log(`   ${geminiResult.message}`);

  // Test Tavily
  process.stdout.write('Testing Tavily (Web Search)... ');
  const tavilyResult = await testTavily();
  console.log(tavilyResult.success ? '✅' : '❌');
  console.log(`   ${tavilyResult.message}`);

  // Test Anthropic
  process.stdout.write('Testing Anthropic (Claude)... ');
  const anthropicResult = await testAnthropic();
  console.log(anthropicResult.success ? '✅' : '❌');
  console.log(`   ${anthropicResult.message}`);

  console.log('─'.repeat(50));

  const allPassed = geminiResult.success && tavilyResult.success && anthropicResult.success;
  console.log(allPassed ? '\n✅ All API keys working!\n' : '\n⚠️  Some API keys failed - check above\n');

  process.exit(allPassed ? 0 : 1);
}

main();
