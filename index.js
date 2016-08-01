'use strict';

var through         = require('through2');
var path            = require('path');
var bless           = require('bless');
var gutil           = require('gulp-util');
var merge           = require('merge');
var applySourcemap  = require('vinyl-sourcemaps-apply');

var File = gutil.File;
var PluginError = gutil.PluginError;

module.exports = function(options) {
    var pluginName = 'gulp-bless';
    options = options || {};
    options.imports = options.imports === undefined ? true : options.imports;
    options.cacheBuster = options.cacheBuster === undefined ? true : options.cacheBuster;

    return through.obj(function(file, enc, cb) {
        if (file.isNull()) return cb(null, file); // ignore
        if (file.isStream()) return cb(new PluginError(pluginName, 'Streaming not supported'));

        var stream = this;
        var shouldCreateSourcemaps = Boolean(file.sourceMap);

        if (file.contents && file.contents.toString()) {
            var outputFilePath = file.path;
            var contents = file.contents.toString(enc);

            // do the blessing
            var result;
            try {
                result = bless.chunk(contents, {
                    source: outputFilePath,
                    sourcemaps: shouldCreateSourcemaps
                });
            }
            catch (err) {
                return cb(new PluginError(pluginName,  err));
            }

            // print log message
            var numberOfSplits = result.data.length;
            if (options.log) {
                var msg = 'Found ' + result.totalSelectorCount + ' selector';
                if (numberOfSplits > 1) {
                    msg += 's, splitting into ' + numberOfSplits + ' blessedFiles.';
                } else {
                    msg += ', not splitting.';
                }
                gutil.log(msg);
            }

            // get out early if the file isn't long enough
            if(result.data.length === 1) {
                return cb(null, file);
            }

            var addSourcemap = function(fileToAddTo, blessOutputIndex) {
                if (shouldCreateSourcemaps) {
                    var sourcemap =  result.maps[blessOutputIndex];
                    sourcemap.file = fileToAddTo.relative;
                    applySourcemap(fileToAddTo, sourcemap);
                }
                return fileToAddTo;
            };

            var outputPathStart = path.dirname(outputFilePath);
            var outputExtension = path.extname(outputFilePath);
            var outputBasename = path.basename(outputFilePath, outputExtension);
            var lastSplitIndex = numberOfSplits - 1;

            var createBlessedFileName = function(index){
                return outputBasename + '-blessed' + (index + 1) + outputExtension;
            };

            var addImports = function(index, contents){
                // only the last file should have @imports
                if (!options.imports || index !== lastSplitIndex) {
                  return contents;
                }

                var imports = '';
                var parameters = options.cacheBuster ? '?z=' + Math.round((Math.random() * 999)) : '';
                for (var i = 0; i < lastSplitIndex; i++) {
                    imports += "@import url('" + createBlessedFileName(i) + parameters + "');\n\n";
                }

                return imports + contents;
            };

            // process all files
            var currentFile;
            for(var j = 0; j < numberOfSplits; j++) {
                currentFile = file.clone({contents: false});
                if (j !== lastSplitIndex) {
                    currentFile.path = path.join(outputPathStart, createBlessedFileName(j));
                    // currentFile.basename = createBlessedFileName(j);
                }
                currentFile.contents = new Buffer(addImports(j, result.data[j]));
                stream.push(addSourcemap(currentFile, j));
            }

            cb();
        }
        else {
            cb(null, file);
        }
    });
};
