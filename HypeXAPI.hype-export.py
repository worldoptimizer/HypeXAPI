#!/usr/bin/python

# 	HypeXAPI.hype-export.py
#	This export script offers helpers and GUI for HypeXAPI
#
#	v1.0.0 Initial release
#   v1.0.1 Added closure compiler caching and error messages in previews   
#   v1.0.2 Added cache compilation of HypeXAPI.js and xapiwrapper.js
#
#	MIT License
#	Copyright (c) 2021 Max Ziebell
#

import argparse
import json
import sys
import distutils.util
import os


# functions for conditions to inject in generated script
javascript_for_hype_functions = """/** 
* Hype functions defined for HYPE.documents["${hype_id}"]
*/

if("HYPE_functions" in window === false) HYPE_functions = Object();
HYPE_functions["${hype_id}"] = Object();
"""

javascript_for_actions = """
"""

javascript_for_previews = """
<script>

var errorLookup = {
	'Uncaught TypeError: Cannot read property': 'This error is thrown when you try to access a property of an object that does not exist. For example, if you try to access the property "name" of an object that does not have a property "name", this error will be thrown.',
	'Uncaught ReferenceError:': 'This error is thrown when you try to access a variable that does not exist. For example, if you try to access the variable "name" that has not been declared, this error will be thrown.',
	'Uncaught SyntaxError:': 'This error is thrown when you have a syntax error in your code. For example, if you forget to close a string with a quotation mark, this error will be thrown.',
	'Uncaught RangeError:': 'This error is thrown when you try to access an index of an array that does not exist. For example, if you try to access the index "10" of an array that only has 5 elements, this error will be thrown.',
	'Uncaught URIError:': 'This error is thrown when you try to encode or decode a URI that is not valid. For example, if you try to encode a URI that contains a space, this error will be thrown.',
	'Uncaught EvalError:': 'This error is thrown when you try to call the function "eval()" with invalid code. For example, if you try to call "eval()" with a string that is not valid JavaScript code, this error will be thrown.',
	'Uncaught TypeError:': 'This error is thrown when you try to call a function with an invalid type of argument. For example, if you try to call the function "parseInt()" with a string that is not a number, this error will be thrown.',
	'Uncaught TypeError: Cannot set property': 'This error is thrown when you try to set a property of an object that does not exist. For example, if you try to set the property "name" of an object that does not have a property "name", this error will be thrown.',
	"Uncaught TypeError: Cannot use \'in\' operator": 'This error is thrown when you try to use the "in" operator on an object that does not have a property with the given name. For example, if you try to use the "in" operator to check if an object has a property "name", but the object does not have a property "name", this error will be thrown.',
	'Uncaught TypeError: Cannot convert undefined or null to object': 'This error is thrown when you try to access a property of an object that is undefined or null. For example, if you try to access the property "name" of an object that is undefined, this error will be thrown.'
}

window.onerror = function(msg, url, line, col, error) {
	var errorMsg = '<h1>' + msg.split(':').join('<br>') + '</h1>';
	for (var key in errorLookup) {
		if (msg.includes(key)) {
			errorMsg += '<h2">' + errorLookup[key] + '</h2>';
		}
	}
	errorMsg += '<div style="background-color: #111; color: #eee; font-family: monospace; border-top: 1px solid #fff; border-bottom: 1px solid #fff; padding: 20px; margin-top: 20px;">';
	errorMsg += '<p>URL: ' + url + '</p>';
	errorMsg += '<p>Line: ' + line + '</p>';
	errorMsg += '<p>Column: ' + col + '</p>';
	errorMsg += '<p>Stack: ' + error.stack + '</p>';
	errorMsg += '</div>';
	errorMsg += '<button id="close-modal" style="position:absolute; top:10px; right:10px;">X</button>';
	errorMsg += '<p style="font-size: 10px; margin-top: 20px; opacity:0.75;">Check the console for more details on the error. You might need to reload the page after opening the console to make the error clickable in the console. On macOS you can open the console with CMD + ALT + I.</p>';
	var modal = document.createElement('div');
	modal.innerHTML = errorMsg;
	modal.style.position = 'fixed';
	modal.style.top = '50%';
	modal.style.left = '50%';
	modal.style.transform = 'translate(-50%, -48%)';
	modal.style.backgroundColor = '#8b0000';
	modal.style.border = '1px solid #000';
	modal.style.padding = '25px';
	modal.style.zIndex = '9999';
	modal.style.color = 'white';
	modal.style.borderRadius = '10px';
	modal.style.fontFamily = 'sans-serif';
	modal.style.boxShadow = '0px 10px 10px rgba(0,0,0,0.5)';
	modal.style.opacity = '0';
	modal.style.transition = 'transform 0.5s ease-out, opacity 0.2s linear';
	document.body.appendChild(modal);
	setTimeout(function() {
		modal.style.transform = 'translate(-50%, -50%)';
		modal.style.opacity = '1';
	}, 10);
	document.getElementById('close-modal').addEventListener('click', function() {
		modal.style.display = 'none';
	});
}
</script>
"""

def main():
	parser = argparse.ArgumentParser()
	parser.add_argument('--hype_version')
	parser.add_argument('--hype_build')

	parser.add_argument('--get_options', action='store_true')

	parser.add_argument('--modify_staging_path')
	parser.add_argument('--destination_path')
	parser.add_argument('--export_info_json_path')
	parser.add_argument('--is_preview', default="False")
	

	args, unknown = parser.parse_known_args()

	if args.get_options:		
		# add actions
		def extra_actions():
			return [
				{"label" : "Set Custom Data...", "function" : "HypeXAPI.GUI.setCustomDataVariable", "arguments":[{"label":"Key", "type": "String"}, {"label":"Value", "type": "String"}]},
				{"label" : "Send Statement...", "function" : "HypeXAPI.GUI.sendStatementByArguments", "arguments":[{"label":"Verb", "type": "String"}, {"label":"Object", "type": "String"}, {"label":"Result", "type": "String"}, {"label":"Context", "type": "String"}]},
				{"label" : "Run Expression...", "function" : "HypeXAPI.GUI.runExpression", "arguments":[{"label":"Expression", "type": "String"}]},				
			]

		def save_options():
			return {
				"allows_export" : True,
				"allows_preview" : True,
			}

		def document_arguments():
			return [
				setting.closure_compiler_on_export,
			]
		
		options = {
			"document_arguments" : document_arguments(),
			"extra_actions" : extra_actions(),
			"save_options" : save_options(),
			"min_hype_build_version" : "596",
		}
	
		exit_with_result(options)

	elif args.modify_staging_path != None:

		#import os
		import string
		import fnmatch
		import re
		import httplib
		import urllib
		import hashlib

		# is preview
		is_preview = bool(distutils.util.strtobool(args.is_preview))

		# export info
		export_info_file = open(args.export_info_json_path)
		export_info = json.loads(export_info_file.read())
		export_info_file.close()
				
		# hype id	
		hype_id = os.path.basename (args.modify_staging_path)
		
		# extra scripts
		javascript_for_prepend = ""
		javascript_for_append = ""

		# read and prepare action helper
		global javascript_for_actions
		global javascript_for_hype_functions
		global javascript_for_prepend
		global javascript_for_append
	
		# Read content from file
		#
		# @param filepath Path to file
		# @return Content of file
		def read_content(filepath):
			""" Read content from file """
			with open(filepath, "r") as f:
				return f.read()

		# Save content to file
		#
		# @param filepath The path to the file
		# @param content The content to be saved
		def save_content(filepath, content):
			""" Save content to file """
			with open(filepath, "w") as f:
				f.write(content)
		
		# Run handler on files
		#
		# @param handler The function to run on the files
		# @param filePattern The pattern to match the files
		def run_on_files(handler, filePattern):
			""" Run handler on files """
			for path, dirs, files in os.walk(os.path.abspath(args.modify_staging_path)):
				for filename in fnmatch.filter(files, filePattern):
					filepath = os.path.join(path, filename)
					handler(filepath)
					
		# Compile JS code with closure API 
		# 
		# @param js_code The code to be compiled
		# @return The compiled code
		def compile_with_closure(js_code):
			""" Compile JS code with closure API """
			params = urllib.urlencode([
				('js_code', js_code),
				('compilation_level', 'SIMPLE_OPTIMIZATIONS'),
				('output_format', 'text'),
				('output_info', 'compiled_code'),
			])
			# send to API
			headers = { "Content-type": "application/x-www-form-urlencoded" }
			conn = httplib.HTTPSConnection('closure-compiler.appspot.com')
			conn.request('POST', '/compile', params, headers)
			response = conn.getresponse()
			compiled_code = response.read()
			conn.close()
			# return
			return compiled_code
		
		# Compile the code with closure compiler and cache the result
		#
		# @param code The code to compile
		# @return The compiled code
		def compile_with_closure_cached(code):
			""" Compile the code with closure compiler and cache the result """
			m = hashlib.md5()
			m.update(code)
			cache_file = m.hexdigest()
			dir_path = os.path.dirname(os.path.realpath(__file__))
			cache_path = os.path.join(dir_path, 'cache')
			if not os.path.exists(cache_path):
				os.makedirs(cache_path)
			else:
				check_cache_size()
			cache_file_path = os.path.join(cache_path, cache_file)
			if os.path.isfile(cache_file_path):
				with open(cache_file_path, 'r') as f:
					return f.read()
			else:
				compiled_code = compile_with_closure(code)
				with open(cache_file_path, 'w') as f:
					f.write(compiled_code)
				return compiled_code

		# Check the size of the cache directory and delete the oldest files if the size is greater than 50
		#
		# @return None
		def check_cache_size():
			""" check the size of the cache directory and delete the oldest files """
			dir_path = os.path.dirname(os.path.realpath(__file__))
			cache_path = os.path.join(dir_path, 'cache')
			if os.path.exists(cache_path):
				files = os.listdir(cache_path)
				if len(files) > 50:
					files.sort(key=lambda x: os.path.getmtime(os.path.join(cache_path, x)))
					for f in files[:len(files)-50]:
						os.remove(os.path.join(cache_path, f))

		# Check if a setting is present in the document arguments
		#
		# @param key The key to check
		# @return True if the key is present, False otherwise
		def has_setting(key):
			""" Check if a setting is present in the document arguments """
			return key in export_info["document_arguments"]
	
		# Check if a setting is present and enabled in the document arguments
		#
		# @param key The key to check
		# @return True if the key is present and enabled, False otherwise
		def enabled_setting(key):
			""" Check if a setting is present and enabled in the document arguments """
			if key in export_info["document_arguments"]:
				return export_info["document_arguments"][key].lower() in ['true', 'enabled', 'on']
			return False
		
		# This function replaces custom variables in the javascript
		#
		# @param js The javascript to replace the variables in
		# @return The javascript with the variables replaced
		def replace_custom_vars(js):
			""" Replaces custom variables in the javascript """
			js = js.replace('${hype_id}', hype_id)
			return js
			
		# Modify the generated script
		#
		# @param filepath The path to the generated script
		# @return None
		def modify_generated_script(filepath):
			# read
			script = read_content(filepath)
			# replace relative with absolute calls in generated script
			script = script.replace('exportScriptOid:"HypeXAPI.hype-export.py",', '')
			script = script.replace('HypeXAPI.GUI.', 'HYPE.documents[\\"'+hype_id+'\\"].')
			# hype function regex with Friedl's "unrolled loop"
			pattern = re.compile(r'name:"(.*?)",source:"([^"\\]*(?:\\.[^"\\]*)*)"')
			# append functions
			hype_functions = ''
			for m in re.finditer(pattern, script):
				new_name = 'HYPE_functions[\\"'+hype_id+'\\"].'+m.group(1)
				script = script.replace(m.group(2), new_name)
				new_name_decoded = new_name.decode('string_escape')
				function_decoded = m.group(2).decode('string_escape')
				hype_functions = hype_functions+"\n"+new_name_decoded+" = "+function_decoded+";\n"
			
			# add javascript for actions and hype functions
			script_additions = javascript_for_hype_functions+"\n"+hype_functions+"\n"+javascript_for_actions

			# use closure API on exports if enabled
			if not is_preview:
				if enabled_setting(setting.closure_compiler_on_export):
					script_additions = compile_with_closure_cached(script_additions)
			
			# append script
			script = script_additions+"\n"+javascript_for_prepend+"\n"+script+"\n"+javascript_for_append

			#save
			save_content(filepath, script)


		# Remove lines from multiline string that contain any of the items in list_to_remove
		# 
		# @param multiline_string The string to remove lines from
		# @param list_to_remove A list of strings to remove from multiline_string
		# @return The multiline_string with lines removed
		def remove_lines(multiline_string, list_to_remove):
			""" Remove lines from multiline string """
			for line in multiline_string.split('\n'):
				for item in list_to_remove:
					if re.search(item, line):
						multiline_string = multiline_string.replace(line, '')
			return multiline_string
		
		# Remove empty lines from a multiline string
		#
		# @param multiline_string The multiline string to remove empty lines from
		# @return The multiline string with empty lines removed
		def remove_empty_lines(multiline_string):
			return "\n".join([ll.rstrip() for ll in multiline_string.splitlines() if ll.strip()])
	
		# Clean up the index.html file
		#
		# @param filepath The path to the index.html file
		# @return None
		def clean_up_index(filepath):
			""" Clean up the index.html file """
			# read
			html = read_content(filepath)
			# lines to remove
			lines_to_remove = ['<!-- copy these lines to', '<!-- Files added by the Resource Library -->', '/HypeXAPI.js"></script>', '/xapiwrapper.min.js"></script>', '<!-- end copy -->']
			# clean up html
			html = remove_lines(html, lines_to_remove)
			html = remove_empty_lines(html) 
			#save
			save_content(filepath, html)
		
		# Add file content to javascript for prepend
		# 
		# @param filepath
		# @return None
		def add_file_content_to_javascript_for_prepend(filepath):
			""" Add file content to javascript for prepend """
			global javascript_for_prepend
			# use closure API on exports if enabled
			script = read_content(filepath)
			# lines to remove
			lines_to_remove = ['<!-- start template', '<!-- end template']
			# clean up html
			script = remove_lines(script, lines_to_remove)
			# compile content and cache if not in preview
			if not is_preview:
				if enabled_setting(setting.closure_compiler_on_export):
					script = compile_with_closure_cached(script)
			# add to prepend
			javascript_for_prepend += script
		
		
		# Add the content of a file to the javascript_for_append variable.
		#
		# @param filepath: The path of the file to add.
		# @return: None
		def add_file_content_to_javascript_for_append(filepath):
			""" Add the content of a file to the javascript_for_append variable. """
			global javascript_for_append
			script = read_content(filepath)
			javascript_for_append += script
		
		# Remove the xAPI file
		#
		# @param filepath: the path of the xAPI file
		# @return: None
		def remove_xapi_file(filepath):
			""" Remove the xAPI file """
			os.remove(filepath)
		
		# Insert a string at the end of a pattern
		#
		# @param pattern: the pattern to search
		# @param string: the string to search in
		# @param insert: the string to insert
		# @return: the string with the insert at the end of the pattern
		def insert_at_end(pattern, string, insert):
			""" Insert a string at the end of a pattern """
			temp = re.search(pattern, string, re.IGNORECASE).start() 
			return string[:temp] + insert + string[temp:]
		
		# Insert a string at the start of a pattern
		#
		# @param pattern: the pattern to search
		# @param string: the string to search in
		# @param insert: the string to insert
		# @return: the string with the insert at the start of the pattern
		def insert_at_start(pattern, string, insert):
			""" Insert a string at the start of a pattern """
			temp = re.search(pattern, string, re.IGNORECASE).end()
			return string[:temp] + insert + string[temp:]
		
		
		# Add the javascript for the previews to the file
		# 
		# @param filepath: The path to the file
		# @return None
		def add_javascript_for_preview(filepath):
			""" Add the javascript for the previews to the file """
			global javascript_for_previews
			index_contents = read_content(filepath)
			index_contents = insert_at_start("<head.*?>", index_contents, javascript_for_previews)
			save_content(filepath, index_contents)
			
		
		# start processing
		run_on_files(add_file_content_to_javascript_for_prepend, 'xapiwrapper.min.js')
		run_on_files(add_file_content_to_javascript_for_prepend, 'HypeXAPI.js')		
			
		# replace vars in js fragments
		javascript_for_actions = replace_custom_vars(javascript_for_actions)
		javascript_for_hype_functions = replace_custom_vars(javascript_for_hype_functions)
		javascript_for_prepend = replace_custom_vars(javascript_for_prepend)
		javascript_for_append = replace_custom_vars(javascript_for_append)
		
		run_on_files(modify_generated_script, '*_hype_generated_script.js')
		
		import shutil
		shutil.rmtree(args.destination_path, ignore_errors=True)
		
		# remove files
		run_on_files(remove_xapi_file, 'xapiwrapper.min.js')
		run_on_files(remove_xapi_file, 'HypeXAPI.js')
		
		# remove strings
		run_on_files(clean_up_index, '*.html')
		
		# add javascript_for_preview if we are in a preview
		if is_preview:
			run_on_files(add_javascript_for_preview, '*.html')
		
		shutil.move(args.modify_staging_path, args.destination_path)

		exit_with_result(True)

# UTILITIES
class setting:
	closure_compiler_on_export = "Closure compiler on export"

# communicate info back to Hype
def exit_with_result(result):
	import sys
	print "===================="
	print json.dumps({"result" : result})
	sys.exit(0)


if __name__ == "__main__":
	main()
