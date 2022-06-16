const puppeteer = require('puppeteer');
const path = require('path');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const ffmpeg = require('fluent-ffmpeg');
ffmpeg.setFfmpegPath(ffmpegPath);

const fps = 60;
const bannerUrl = 'http://localhost:8000/src_plain_300x250/index.html';

let screenshot_nr = 0;
let nextFrame = 0;
const screenshotBase = './ss/example_';
const screenshotExt = 'png';
let bannerDetails = {};

async function recordScreenshots() {
    return new Promise(async (resolve, reject) => {
        try {
            console.log('starting browser')
            const browser = await puppeteer.launch({
                executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
                headless: false
            });

            console.log('new page')
            const page = await browser.newPage();

            await page.exposeFunction('onCustomEvent', async (e) => {
                console.log(`${e.type} fired`, e.detail || '');

                if (e.type === 'animation-info') {
                    bannerDetails = e.detail;

                    await page.evaluate( function() {
                        const event = new CustomEvent("animation-info-received");
                        document.dispatchEvent(event)
                    });
                };


                if (e.type === 'animation-record') {
                    console.log('Recording frame ' + nextFrame)

                    await page.screenshot({
                        path: screenshotBase + screenshot_nr + '.' + screenshotExt,
                        clip: {
                            x: 0,
                            y: 0,
                            width: bannerDetails.width,
                            height: bannerDetails.height
                        }
                    });
                    screenshot_nr++;
                    nextFrame += (1000 / fps);

                    await page.evaluate( function(nextFrame){
                        const event = new CustomEvent("animation-gotoframe-request", { "detail": nextFrame });
                        document.dispatchEvent(event)
                    }, nextFrame);
                }


                if (e.type === 'animation-end') {
                    console.log('stop recording')
                    await browser.close();
                    resolve();
                }
            });

            function listenFor(type) {
                return page.evaluateOnNewDocument((type) => {
                    document.addEventListener(type, (e) => {
                        window.onCustomEvent({ type, detail: e.detail });
                    });
                }, type);
            }

            await listenFor('animation-record');
            await listenFor('animation-end');
            await listenFor('animation-info');

            await page.goto(bannerUrl);

            try {
                dimensions = await page.$eval("head > meta[name='ad.size']", async (element) => {
                    const dimensions = element.content.split(',');
                    const width = dimensions[0].split('=')
                    const height = dimensions[1].split('=')
                    return {
                        width: parseInt(width[1]),
                        height: parseInt(height[1])
                    }

                });
            } catch (e) {
                console.log('not a ad?');
                await browser.close();
                reject(e);
            }
        } catch (e) {
            reject(e);
        }
    })
}

function convertToVideo(input, output, fps) {
    return new Promise((resolve, reject) => {
        try {
            const process = ffmpeg();
            process.addInput(input);
            process.fpsInput(fps)
            process.fps(fps)
            process.videoBitrate(10000)
            process.output(output);
            process.on('progress', (progress) => console.log(progress))
            process.on('end', () => resolve())
            process.run();

        } catch (e) {
            reject(e);
        }
    })
}

(async () => {
    console.log('recording screenshots');
    await recordScreenshots();

    console.log('converting to video');
    await convertToVideo(`${screenshotBase}%d.${screenshotExt}`, './video.mp4', fps);
})();