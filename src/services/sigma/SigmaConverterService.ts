import type { ConversionResult, ConversionParams, WorkerStatus } from './types';
import { SUPPORTED_BACKENDS } from './backends';

// Inline worker code - CDN with proper error handling
const workerCode = `
// ============================================
// PYODIDE SIGMA CONVERTER WORKER - STABLE VERSION
// ============================================

console.log('[Worker] Starting worker initialization...');

const SUPPORTED_BACKENDS = ${JSON.stringify(SUPPORTED_BACKENDS)};

const SIGMA_CONVERTER_PYTHON_CODE = \`
import yaml

# Pyodide compatibility: PyYAML doesn't have C extensions (CSafeLoader, CDumper)
# This MUST run before any sigma imports
if not hasattr(yaml, 'CSafeLoader'):
    yaml.CSafeLoader = yaml.SafeLoader
if not hasattr(yaml, 'CDumper'):
    yaml.CDumper = yaml.Dumper
if not hasattr(yaml, 'CSafeDumper'):
    yaml.CSafeDumper = yaml.SafeDumper

from sigma.collection import SigmaCollection
from sigma.conversion.base import Backend
from sigma.exceptions import SigmaError
from sigma.plugins import InstalledSigmaPlugins
from sigma.processing.pipeline import ProcessingPipeline

plugins = InstalledSigmaPlugins.autodiscover()
backends = plugins.backends

def convert_rule(rule_yaml, target, pipeline_ymls=None, filter_yml=None, format="default", backend_options=None):
    if filter_yml:
        rule_yaml = filter_yml + "\\\\n---\\\\n" + rule_yaml
    
    rule_collection = SigmaCollection.from_yaml(rule_yaml)
    
    processing_pipeline = None
    if pipeline_ymls:
        for pipeline_yml in pipeline_ymls:
            if pipeline_yml and pipeline_yml.strip():
                custom_pipeline = ProcessingPipeline.from_yaml(pipeline_yml)
                if processing_pipeline is None:
                    processing_pipeline = custom_pipeline
                else:
                    processing_pipeline = processing_pipeline + custom_pipeline
    
    if target not in backends:
        available = ", ".join(backends.keys())
        raise SigmaError(f"Backend '{target}' not found. Available: {available}")
    
    backend_class = backends[target]
    backend_options = backend_options or {}
    
    backend = backend_class(processing_pipeline=processing_pipeline, **backend_options)
    
    if format not in backend_class.formats:
        available_formats = ", ".join(backend_class.formats.keys())
        raise SigmaError(f"Format '{format}' not supported. Available: {available_formats}")
    
    result = backend.convert(rule_collection, format)
    
    if backend.errors:
        error_list = [f"{str(r.source)}: {str(e)}" for r, e in backend.errors]
        if error_list:
            raise SigmaError("\\\\n".join(error_list))
    
    if isinstance(result, str):
        return result
    elif isinstance(result, list):
        return "\\\\n\\\\n".join(str(item) for item in result)
    else:
        return str(result)
\`;

let pyodide = null;
const installedBackends = new Set();
let pythonModuleLoaded = false;
let sigmaNamespace = null;

let currentStatus = {
    ready: false,
    pyodideReady: false,
    installedBackends: [],
};

function updateStatus(status) {
    currentStatus = {
        ...currentStatus,
        ...status,
        installedBackends: Array.from(installedBackends),
    };
    
    console.log('[Worker] Status update:', currentStatus);
    
    self.postMessage({
        type: 'status_update',
        payload: currentStatus
    });
}

async function loadPythonModule() {
    if (!pyodide) return false;
    
    try {
        console.log('[Worker] Loading Python module...');
        sigmaNamespace = pyodide.globals.get("dict")();
        pyodide.runPython(SIGMA_CONVERTER_PYTHON_CODE, { globals: sigmaNamespace });
        pythonModuleLoaded = true;
        console.log('[Worker] Python module loaded successfully');
        return true;
    } catch (error) {
        console.error('[Worker] Error loading Python module:', error);
        updateStatus({ error: 'Error loading Python module: ' + error.message });
        return false;
    }
}

async function installBackend(target) {
    if (installedBackends.has(target)) {
        return { success: true };
    }
    
    const backendConfig = SUPPORTED_BACKENDS[target];
    if (!backendConfig || !backendConfig.package) {
        return { success: false, error: 'No package found for target ' + target };
    }
    
    try {
        console.log('[Worker] Installing backend:', target, backendConfig.package);
        updateStatus({ ready: false });
        
        const micropip = pyodide.pyimport("micropip");
        const pkg = backendConfig.package;

        // Pinned in backends.ts to a release that supports pySigma 1.3.3
        console.log('[Worker] Installing backend package:', pkg);
        await micropip.install(pkg.split(' '));
        installedBackends.add(target);
        
        pythonModuleLoaded = false;
        await loadPythonModule();
        
        updateStatus({ ready: true });
        console.log('[Worker] Backend installed:', target);
        
        return { success: true };
    } catch (error) {
        const errorMsg = error.message || String(error);
        console.error('[Worker] Error installing backend:', errorMsg);
        updateStatus({ error: 'Error installing backend: ' + errorMsg });
        return { success: false, error: errorMsg };
    }
}

async function convertRule(params) {
    const {
        rule,
        target,
        pipelineYmls = [],
        filterYml = '',
        format = 'default',
        backendOptions = {},
    } = params;
    
    console.log('[Worker] Converting rule for target:', target);
    
    if (!installedBackends.has(target)) {
        const installResult = await installBackend(target);
        if (!installResult.success) {
            return { error: installResult.error };
        }
    }
    
    if (!pythonModuleLoaded) {
        await loadPythonModule();
    }
    
    try {
        const backendConfig = SUPPORTED_BACKENDS[target];
        const pythonParams = {
            rule_yaml: rule,
            target: backendConfig ? backendConfig.id : target,
            pipeline_ymls: pipelineYmls.length > 0 ? pipelineYmls : null,
            filter_yml: filterYml || null,
            format: format,
            backend_options: Object.keys(backendOptions).length > 0 ? backendOptions : null,
        };
        
        const convertParams = pyodide.toPy(pythonParams);
        sigmaNamespace.update(convertParams);
        
        const pythonCode = \`
convert_rule(
    rule_yaml,
    target,
    pipeline_ymls=pipeline_ymls,
    filter_yml=filter_yml,
    format=format,
    backend_options=backend_options
)
\`;
        
        const result = pyodide.runPython(pythonCode, { globals: sigmaNamespace });
        console.log('[Worker] Conversion successful');
        return { result: result ? result.toString() : '' };
    } catch (error) {
        console.error('[Worker] Conversion error:', error);
        return { error: error.message || String(error) };
    }
}

async function initializePyodide() {
    try {
        console.log('[Worker] Starting Pyodide initialization...');
        updateStatus({ ready: false, pyodideReady: false });

        console.log('[Worker] Importing Pyodide 0.29.0 from CDN...');
        const { loadPyodide } = await import('https://cdn.jsdelivr.net/pyodide/v0.29.0/full/pyodide.mjs');

        console.log('[Worker] Loading Pyodide runtime...');
        pyodide = await loadPyodide({
            indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.29.0/full/',
        });

        console.log('[Worker] Loading micropip...');
        await pyodide.loadPackage('micropip');
        const micropip = pyodide.pyimport('micropip');

        // Install custom PyYAML 6.0.3 wheel for pySigma 1.x compatibility
        const wheelUrl = new URL('/wheels/pyyaml-6.0.3-cp313-cp313-pyodide_2025_0_wasm32.whl', self.location.origin).href;
        console.log('[Worker] Installing custom PyYAML 6.0.3 wheel:', wheelUrl);
        await micropip.install(wheelUrl);

        // CRITICAL: Add PyYAML compatibility shim BEFORE installing pySigma
        // Pyodide's PyYAML doesn't have C extensions (CSafeLoader, CDumper)
        // This must run AFTER PyYAML is installed but BEFORE pySigma imports it
        console.log('[Worker] Adding PyYAML compatibility shim...');
        pyodide.runPython(\`
import yaml
# Pyodide compatibility: PyYAML doesn't have C extensions
if not hasattr(yaml, 'CSafeLoader'):
    yaml.CSafeLoader = yaml.SafeLoader
if not hasattr(yaml, 'CDumper'):
    yaml.CDumper = yaml.Dumper
if not hasattr(yaml, 'CSafeDumper'):
    yaml.CSafeDumper = yaml.SafeDumper
print('[Python] PyYAML shim applied - CSafeLoader:', hasattr(yaml, 'CSafeLoader'))
\`);

        // Install pySigma pinned below 1.4.0. pySigma 1.4.0 added a hard
        // dependency on jq (a C-extension package with no pure-Python / WASM
        // wheel), which micropip cannot install in Pyodide -- it fails engine
        // init with "Can't find a pure Python 3 wheel for jq". 1.3.x is the
        // last jq-free 1.x line and still targets PyYAML 6.0.3+. Pinned exactly,
        // together with the plugins in backends.ts, so an upstream release
        // cannot change the installed set.
        console.log('[Worker] Installing pySigma 1.3.3 (jq-free for Pyodide)...');
        await micropip.install('pysigma==1.3.3');

        // Install common pipelines
        console.log('[Worker] Installing pySigma pipelines...');
        await micropip.install(['pysigma-pipeline-windows==2.0.1', 'pysigma-pipeline-sysmon==2.0.0']);

        updateStatus({ pyodideReady: true });
        console.log('[Worker] Pyodide ready, loading Python module...');

        await loadPythonModule();

        updateStatus({ ready: true });
        console.log('[Worker] Initialization complete!');

        return true;
    } catch (error) {
        console.error('[Worker] Error initializing Pyodide:', error);
        updateStatus({
            ready: false,
            pyodideReady: false,
            error: error.message || String(error)
        });
        return false;
    }
}

self.onmessage = async (event) => {
    const { type, payload } = event.data;
    console.log('[Worker] Received message:', type);
    
    try {
        switch (type) {
            case 'init':
                await initializePyodide();
                break;
                
            case 'convert':
                const convertResult = await convertRule(payload);
                self.postMessage({ type: 'result', requestId: event.data.requestId, payload: convertResult });
                break;

            case 'installBackend':
                const installResult = await installBackend(payload.target);
                self.postMessage({ type: 'result', requestId: event.data.requestId, payload: installResult });
                break;
                
            case 'status':
                self.postMessage({ type: 'status', payload: currentStatus });
                break;
                
            default:
                self.postMessage({ 
                    type: 'error', 
                    payload: { error: 'Unknown message type: ' + type } 
                });
        }
    } catch (error) {
        console.error('[Worker] Error handling message:', error);
        self.postMessage({
            type: 'error',
            requestId: event.data.requestId,
            payload: { error: error.message || String(error) }
        });
    }
};

console.log('[Worker] Worker script loaded, waiting for init message...');
`;

function createWorkerBlob(): string {
    const blob = new Blob([workerCode], { type: 'application/javascript' });
    return URL.createObjectURL(blob);
}

export class SigmaConverterService {
    private worker: Worker | null = null;
    private workerUrl: string | null = null;
    private ready: boolean = false;
    private pendingRequests: Map<string, { resolve: (...args: unknown[]) => unknown; reject: (...args: unknown[]) => unknown }> = new Map();
    private readinessListeners: ((ready: boolean) => void)[] = [];
    private statusListeners: ((status: WorkerStatus) => void)[] = [];
    private currentStatus: WorkerStatus = {
        ready: false,
        pyodideReady: false,
        installedBackends: [],
    };
    private initTimeout: number | null = null;

    constructor() {
        this.initWorker();
    }

    private initWorker() {
        try {
            console.log('[SigmaService] Creating worker from blob...');
            
            this.workerUrl = createWorkerBlob();
            this.worker = new Worker(this.workerUrl, { type: 'module' });
            
            console.log('[SigmaService] Worker created, setting up handlers...');
            
            this.worker.onmessage = this.handleMessage.bind(this);
            this.worker.onerror = this.handleError.bind(this);
            
            console.log('[SigmaService] Sending init message to worker...');
            this.worker.postMessage({ type: 'init' });
            
            this.initTimeout = window.setTimeout(() => {
                if (!this.ready) {
                    console.error('[SigmaService] Initialization timeout after 120 seconds');
                    this.updateStatusDirectly({
                        ready: false,
                        pyodideReady: false,
                        installedBackends: [],
                        error: 'Initialization timeout. Check console for details.'
                    });
                }
            }, 120000);
            
        } catch (error) {
            console.error('[SigmaService] Failed to initialize worker:', error);
            this.updateStatusDirectly({
                ready: false,
                pyodideReady: false,
                installedBackends: [],
                error: 'Failed to initialize worker: ' + (error instanceof Error ? error.message : String(error))
            });
        }
    }

    private updateStatusDirectly(status: WorkerStatus) {
        this.currentStatus = status;
        this.ready = status.ready;
        this.statusListeners.forEach(fn => fn(status));
        this.readinessListeners.forEach(fn => fn(this.ready));
    }

    private handleMessage(event: MessageEvent) {
        const { type, requestId, payload } = event.data;

        console.log('[SigmaService] Received message from worker:', type, payload);

        switch (type) {
            case 'status_update':
                if (this.initTimeout && payload.ready) {
                    clearTimeout(this.initTimeout);
                    this.initTimeout = null;
                }

                this.currentStatus = payload;
                this.ready = payload.ready;
                this.statusListeners.forEach(fn => fn(payload));
                this.readinessListeners.forEach(fn => fn(this.ready));
                break;

            case 'status':
                this.currentStatus = payload;
                this.ready = payload.ready;
                break;

            case 'result':
                if (requestId) {
                    const pending = this.pendingRequests.get(requestId);
                    if (pending) {
                        pending.resolve(payload);
                        this.pendingRequests.delete(requestId);
                    }
                }
                break;

            case 'error':
                if (requestId) {
                    const pending = this.pendingRequests.get(requestId);
                    if (pending) {
                        pending.reject(new Error(payload.error));
                        this.pendingRequests.delete(requestId);
                    }
                }
                break;
        }
    }

    private handleError(error: ErrorEvent) {
        console.error('[SigmaService] Worker error:', error);

        if (this.initTimeout) {
            clearTimeout(this.initTimeout);
            this.initTimeout = null;
        }

        // Reject all pending requests on worker-level error
        for (const [requestId, pending] of this.pendingRequests) {
            pending.reject(new Error(error.message));
        }
        this.pendingRequests.clear();
        
        this.updateStatusDirectly({
            ready: false,
            pyodideReady: false,
            installedBackends: [],
            error: 'Worker error: ' + error.message
        });
    }

    async convert(
        rule: string,
        target: string,
        options: {
            pipelineYmls?: string[];
            filterYml?: string;
            format?: string;
            backendOptions?: Record<string, any>;
        } = {}
    ): Promise<ConversionResult> {
        if (!this.worker) {
            return { query: '', error: 'Worker not initialized' };
        }

        const requestId = crypto.randomUUID();

        return new Promise((resolve, reject) => {
            this.pendingRequests.set(requestId, { resolve, reject });

            this.worker!.postMessage({
                type: 'convert',
                requestId,
                payload: {
                    rule,
                    target,
                    pipelineYmls: options.pipelineYmls || [],
                    filterYml: options.filterYml || '',
                    format: options.format || 'default',
                    backendOptions: options.backendOptions || {},
                } as ConversionParams
            });
        }).then((result: any) => {
            if (result.error) {
                return { query: '', error: result.error };
            }
            return { query: result.result || '' };
        }).catch((error) => {
            return { query: '', error: error.message };
        });
    }

    async installBackend(target: string): Promise<{ success: boolean; error?: string }> {
        if (!this.worker) {
            return { success: false, error: 'Worker not initialized' };
        }

        const requestId = crypto.randomUUID();

        return new Promise((resolve, reject) => {
            this.pendingRequests.set(requestId, { resolve, reject });

            this.worker!.postMessage({
                type: 'installBackend',
                requestId,
                payload: { target }
            });
        });
    }

    onReady(callback: (ready: boolean) => void): () => void {
        this.readinessListeners.push(callback);
        callback(this.ready);
        
        return () => {
            const idx = this.readinessListeners.indexOf(callback);
            if (idx > -1) this.readinessListeners.splice(idx, 1);
        };
    }

    onStatusChange(callback: (status: WorkerStatus) => void): () => void {
        this.statusListeners.push(callback);
        callback(this.currentStatus);
        
        return () => {
            const idx = this.statusListeners.indexOf(callback);
            if (idx > -1) this.statusListeners.splice(idx, 1);
        };
    }

    isReady(): boolean {
        return this.ready;
    }

    getStatus(): WorkerStatus {
        return { ...this.currentStatus };
    }

    dispose() {
        if (this.initTimeout) {
            clearTimeout(this.initTimeout);
            this.initTimeout = null;
        }
        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
        }
        if (this.workerUrl) {
            URL.revokeObjectURL(this.workerUrl);
            this.workerUrl = null;
        }
        this.readinessListeners = [];
        this.statusListeners = [];
        this.pendingRequests.clear();
    }
}