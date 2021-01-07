
const max = require('max-api');
const fs = require('fs-extra');
const path = require('path');
const url = require('url');
const fetch = require('fetch').fetchUrl;

const Jimp = require('jimp');
const Scraper = require('images-scraper');
const sizeOf = require('image-size');

// Amount of images to search and try to download
let amount = 5;

// Every possible tbs search option, some examples and more info: http://jwebnet.net/advancedgooglesearch.html
// isz:  l(arge), m(edium), i(cons), etc.
// itp:  clipart, face, lineart, news, photo
// ic:   color, gray, trans
// sur:  fmc (commercial reuse with modification), fc (commercial 
// 		 reuse), fm (noncommercial reuse with modification), 
// 		 f (noncommercial reuse)
let options = {
	// isz: 'l',
	// ic: 'color',
	// itp: 'news',
	// sur: 'fmc',
}

// Proces options added can crop the image, resize, grayscale 
// and perform other postprocessing in batches
let post = {
	quality: 100,
	square: true,
	width: Infinity,
	height: Infinity,
	invert: false,
	grayscale: false,
}
let defaultPost = { ...post };

// Handlers for messages from Max
const handlers = {
	'size' : (s) => {
		// set the image size: (l)arge, m(edium), i(cons)
		options.isz = s;
	},
	'type' : (t) => {
		// set the image type: photo, news, lineart, face, clipart
		options.itp = t;
	},
	'mode' : (c) => {
		// set the color mode: color, gray, trans
		options.ic = c;
	},
	'license' : (l) => {
		// set the licensing option: fmc, fc, fm, f
		options.sur = l;
	},
	'amount' : (a) => {
		// set the amount of images to try to download
		amount = Math.max(1, a);
	},
	'square' : (s) => {
		// post process the image to a square
		post.square = s > 0;
	},
	'quality' : (q) => {
		// set the postprocessing compression quality 0 - 100
		post.quality = Math.max(0, Math.min(q, 100));
	},
	'invert' : (i) => {
		// invert the image in post
		post.invert = i > 0;
	},
	'gray' : (g) => {
		// convert the image to grayscale in post
		post.grayscale = g > 0;
	},
	'width' : (w) => {
		// set the output width for the image
		post.width = Math.max(1, w);
	},
	'height' : (h) => {
		// set the output height for the image
		post.height = Math.max(1, h);
	},
	'process' : (p) => {
		post = { ...p };
	},
	'options' : (o) => {
		options = { ...o };
	},
	'clear' : () => {
		// clear the options
		options = {};
		post = { ...defaultPost };
		max.post('options cleared');
	}
}
max.addHandlers(handlers);

// The main iamge scraper and post-processing
max.addHandler('search', (...s) => {
	let query = s.join(' ');
	let name = query.replace(/(\s+$|^\s+)/g, '').replace(/\s+/g, '-');

	// create a downloads folder for scraping results if not existing
	fs.ensureDirSync(`./downloads/${query}`);

	// log file for urls, original names and new filenames
	let log = logFileSetup(query, options);

	// create a new Scraper instance with options
	// uses headless Chromium Browser
	let google = new Scraper({
		puppeteer: {
			headless: true
		}, 
		tbs: options
	});

	max.post(`scraping google images for [${query}]...`);
	max.post('settings', options);

	(async () => {
		let results = await google.scrape(query, amount);
		max.post(`found ${results.length} images, downloading...`);
		// accumulate if finished fetch
		let iter = 0;

		for (let i in results){
			
			fetch(results[i].url, (err, meta, body) => {
				iter++;
				if (err) max.post('Error downloading image!');
				else {
					// parse the url
					let header = url.parse(meta.finalUrl);
					// get the extension for filenaming
					let ext = path.parse(header.pathname).ext.toLowerCase();
					// add .jpg extension if empty string
					if (!ext) { ext = '.jpg' };
					// the filename and folder
					let file = `${name}-${i.padStart(3, '0')}${ext}`;
					
					// write the file then postprocess
					fs.writeFile(`./downloads/${query}/${file}`, body, (err) => {
						if (err) max.post('Error writing file');
						else {
							// first write the file
							max.post(`writing ${file} complete`);

if (post){
	Jimp.read(`./downloads/${query}/${file}`, (err, image) => {
		if (err) max.post('Error postprocessing file');
		else {
			image.quality(post.quality);

			if (post.invert){
				image.invert();
			}
			if (post.grayscale){
				image.grayscale();
			}
			if (post.square){
				let dim = sizeOf(`./downloads/${query}/${file}`);
				let w = Math.min(dim.width, dim.height);
				image.cover(w, w);
			}
			if (post.width < Infinity || post.height < Infinity){
				image.scaleToFit(post.width, post.height);
			}
			// overwrite file
			image.write(`./downloads/${query}/${file}`);
			
			// max.post(`post-processing ${file} complete`);
		}
	});
}

							log += logEntry(file, meta.finalUrl);
						}
					});
				}
				// max.post('next', iter);
				if (iter == results.length){
					max.post('scraping done!');
					fs.writeFileSync(`./downloads/${query}/log.txt`, log);
					// output file folder location
					max.outlet(path.join(process.cwd(), `./downloads/${query}`));
				}
			});
		}
	})();
})

// Setup the logfile text
function logFileSetup(search, options){
	let log = 'Image Search Log\n';
	log += 	  '================================\n\n';
	log +=    'search:\n> ' + search + '\n\n';
	log +=    'options:\n';

	Object.keys(options).forEach((k) => {
		log += '> ' + k + ': ' + options[k] + '\n';
	});

	log +=    '\npost-proceessing:\n';
	Object.keys(post).forEach((k) => {
		log += '> ' + k + ': ' + post[k] + '\n';
	});

	return log;
}

// Add an entry to the logfile for a download
function logEntry(name, url){
	let entry = `\n${name}\n\n`;
	entry += `> ${url}\n`;
	return entry;
}
