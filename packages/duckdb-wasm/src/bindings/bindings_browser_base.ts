import { DuckDBModule } from './duckdb_module';
import { DuckDBBindings } from './bindings';
import { DuckDBRuntime } from './runtime';
import { Logger } from '../log';

declare global {
    // eslint-disable-next-line no-var
    var DUCKDB_RUNTIME: any;
}

/** DuckDB bindings for the browser */
export abstract class DuckDBBrowserBindings extends DuckDBBindings {
    /** The path of the wasm module */
    protected mainModuleURL: string;
    /** The path of the pthread worker script */
    protected pthreadWorkerURL: string | null;

    /** Constructor */
    public constructor(logger: Logger, runtime: DuckDBRuntime, mainModuleURL: string, pthreadWorkerURL: string | null) {
        super(logger, runtime);
        this.mainModuleURL = mainModuleURL;
        this.pthreadWorkerURL = pthreadWorkerURL;
    }

    /** Locate a file */
    protected locateFile(path: string, prefix: string): string {
        if (path.endsWith('.wasm')) {
            return this.mainModuleURL;
        }
        if (path.endsWith('.worker.js')) {
            if (!this.pthreadWorkerURL) {
                throw new Error('Missing DuckDB worker URL!');
            }
            return this.pthreadWorkerURL!;
        }
        throw new Error(`WASM instantiation requested unexpected file: prefix=${prefix} path=${path}`);
    }

    /** Instantiate the wasm module */
    protected instantiateWasm(
        // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
        imports: any,
        success: (instance: WebAssembly.Instance, module: WebAssembly.Module) => void,
    ): Emscripten.WebAssemblyExports {
        const imports_rt: WebAssembly.Imports = {
            ...imports,
            env: {
                ...imports.env,
                ...this._runtime,
            },
        };
        if (WebAssembly.instantiateStreaming) {
            WebAssembly.instantiateStreaming(fetch(this.mainModuleURL), imports_rt).then(output => {
                globalThis.DUCKDB_RUNTIME = {};

                for (const func of Object.getOwnPropertyNames(this._runtime)) {
                    if (func == 'constructor') continue;
                    globalThis.DUCKDB_RUNTIME[func] = Object.getOwnPropertyDescriptor(this._runtime, func)!.value;
                }
                success(output.instance, output.module);
            });
        } else {
            fetch(this.mainModuleURL)
                .then(resp => resp.arrayBuffer())
                .then(bytes =>
                    WebAssembly.instantiate(bytes, imports_rt).then(output => {
                        globalThis.DUCKDB_RUNTIME = {};

                        for (const func of Object.getOwnPropertyNames(this._runtime)) {
                            if (func == 'constructor') continue;
                            globalThis.DUCKDB_RUNTIME[func] = Object.getOwnPropertyDescriptor(
                                this._runtime,
                                func,
                            )!.value;
                        }
                        success(output.instance, output.module);
                    }),
                )
                .catch(error => {
                    console.error('Failed to instantiate WASM:', error);
                });
        }
        return [];
    }

    /// Instantiation must be done by the browser variants
    protected abstract instantiate(moduleOverrides: Partial<DuckDBModule>): Promise<DuckDBModule>;
}