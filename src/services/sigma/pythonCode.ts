/**
 * Python code for Sigma rule conversion.
 * This is a wrapper that calls the official pySigma library.
 * The actual conversion logic is in pySigma (installed via micropip).
 */
export const SIGMA_CONVERTER_PYTHON_CODE = `
import json
from typing import List, Dict, Any, Union, Optional

from sigma.collection import SigmaCollection
from sigma.conversion.base import Backend
from sigma.exceptions import SigmaError
from sigma.plugins import InstalledSigmaPlugins
from sigma.processing.pipeline import ProcessingPipeline

# Autodiscover all installed plugins
plugins = InstalledSigmaPlugins.autodiscover()
backends = plugins.backends
pipelines = plugins.pipelines

def get_available_backends():
    """Return list of available backend names"""
    return list(backends.keys())

def get_available_pipelines():
    """Return list of available pipeline names"""
    return list(pipelines.keys())

def convert_rule(
    rule_yaml: str, 
    target: str, 
    pipeline_ymls: List[str] = None,
    filter_yml: str = None,
    format: str = "default",
    backend_options: Dict[str, Any] = None,
) -> str:
    """
    Convert a Sigma rule to the target format.
    
    Args:
        rule_yaml: YAML string containing the Sigma rule
        target: Target backend identifier (e.g., 'splunk', 'kusto')
        pipeline_ymls: List of custom pipeline YAML strings
        filter_yml: Optional filter YAML
        format: Output format for the backend
        backend_options: Optional backend-specific options

    Returns:
        Converted query string
    """
    
    # Parse the rule
    try:
        if filter_yml:
            # Merge filter with rule
            rule_yaml = filter_yml + "\\n---\\n" + rule_yaml
        
        rule_collection = SigmaCollection.from_yaml(rule_yaml)
    except Exception as e:
        raise SigmaError(f"Invalid YAML or Sigma Rule: {str(e)}")
    
    # Build processing pipeline
    processing_pipeline = None
    
    # Add custom pipelines from YAML
    if pipeline_ymls:
        for pipeline_yml in pipeline_ymls:
            if pipeline_yml and pipeline_yml.strip():
                try:
                    custom_pipeline = ProcessingPipeline.from_yaml(pipeline_yml)
                    if processing_pipeline is None:
                        processing_pipeline = custom_pipeline
                    else:
                        processing_pipeline = processing_pipeline + custom_pipeline
                except Exception as e:
                    raise SigmaError(f"Error parsing Pipeline YAML: {str(e)}")
    
    # Check if backend exists
    if target not in backends:
        available = ", ".join(backends.keys())
        raise SigmaError(f"Backend '{target}' not found. Available backends: {available}")
    
    # Initialize backend
    backend_class = backends[target]
    backend_options = backend_options or {}
    
    try:
        backend: Backend = backend_class(
            processing_pipeline=processing_pipeline,
            **backend_options,
        )
    except TypeError as e:
        param = str(e).split("'")[1] if "'" in str(e) else str(e)
        raise SigmaError(f"Parameter '{param}' is not supported by backend '{target}'.")
    
    # Validate format
    if format not in backend_class.formats:
        available_formats = ", ".join(backend_class.formats.keys())
        raise SigmaError(f"Format '{format}' not supported. Available: {available_formats}")
    
    # Convert rule
    try:
        result = backend.convert(rule_collection, format)
    except Exception as e:
        raise SigmaError(f"Conversion Error: {str(e)}")
    
    # Process errors
    if backend.errors:
        error_list = []
        for rule, error in backend.errors:
            error_list.append(f"{str(rule.source)}: {str(error)}")
        if error_list:
            raise SigmaError("\\n".join(error_list))
    
    # Format result
    if isinstance(result, str):
        return result
    elif isinstance(result, list):
        return "\\n\\n".join(str(item) for item in result)
    else:
        return str(result)
`;