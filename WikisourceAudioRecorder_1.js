// ============================================================
// Wikisource Audio Book Recorder & Index Linker
// தமிழ் விக்கிமூல நூல்களை வாசித்துப் பதிவு செய்து விக்கிப் பொதுவகத்தில்
// பதிவேற்றி, உரிய அட்டவணைப் (Index) பக்கத்துடன் இணைக்கும் கருவி
// Author: Dr. Sathiyaraj Thangasamy (Neyakkoo)
// ============================================================

(function () {
    'use strict';

    const ns = mw.config.get('wgNamespaceNumber');
    // முதன்மை (0), பக்கம் (104), அட்டவணை (106) ஆகிய பெயர்வெளிகளில் மட்டும் இயங்கும்
    if (![0, 104, 106].includes(ns)) return;

    const fullTitle = mw.config.get('wgPageName');
    const cleanTitle = mw.config.get('wgTitle');
    const SCRIPT_RE = /[\u0B80-\u0BFF]/;

    if (!SCRIPT_RE.test(cleanTitle)) return;

    let mediaRecorder = null;
    let audioChunks = [];
    let recordedBlob = null;
    let streamRef = null;

    // 1. தலைப்பிற்கு அருகில் ஒலிப்பதிவு பொத்தானைச் சேர்த்தல்
    function addRecordButton() {
        if ($('#ws-audio-record-btn').length > 0) return;

        const btn = $('<button>', {
            id: 'ws-audio-record-btn',
            type: 'button',
            title: 'இந்நூல் / பக்கத்தை வாசித்து ஒலிப்பதிவு செய்து அட்டவணையில் இணை'
        })
        .html('🎙️ <b>நூல் ஒலிப்பதிவு செய் & அட்டவணையில் இணை</b>')
        .css({
            'margin-left': '12px',
            'padding': '5px 12px',
            'background-color': '#006699',
            'color': '#ffffff',
            'border': 'none',
            'border-radius': '6px',
            'cursor': 'pointer',
            'font-size': '13px',
            'box-shadow': '0 2px 5px rgba(0,0,0,0.2)',
            'vertical-align': 'middle'
        })
        .on('click', openRecorderModal);

        const $target = $('#firstHeading').length ? $('#firstHeading') : $('#bodyContent');
        $target.first().append(btn);
    }

    // 2. தொடர்புடைய அட்டவணைப் (Index) பக்கத்தைக் கண்டறிதல்
    async function detectIndexPage(wsApi) {
        if (ns === 106) {
            return fullTitle; // ஏற்கனவே அட்டவணைப் பக்கத்தில் உள்ளோம்
        }

        // 'பக்கம்:நூல்.pdf/12' என்பதிலிருந்து 'அட்டவணை:நூல்.pdf' என்பதைப் பிரித்தல்
        if (ns === 104 && cleanTitle.includes('/')) {
            const baseFile = cleanTitle.split('/')[0];
            return 'அட்டவணை:' + baseFile;
        }

        // முதன்மைப் பெயர்வெளிப் பக்கத்தில் இருந்தால், அதில் இணைக்கப்பட்டுள்ள அட்டவணை/பக்கங்களைத் தேடுதல்
        try {
            const res = await wsApi.get({
                action: 'query',
                prop: 'links|templates',
                titles: fullTitle,
                plnamespace: 106,
                pllimit: 5,
                formatversion: 2
            });
            const page = res && res.query && res.query.pages && res.query.pages[0];
            if (page && page.links && page.links.length > 0) {
                return page.links[0].title;
            }
        } catch (e) {
            console.warn('அட்டவணைத் தேடல் பிழை:', e);
        }

        return 'அட்டவணை:' + cleanTitle;
    }

    // 3. ஒலிப்பதிவு முகப்புப் பெட்டி (Modal UI)
    async function openRecorderModal() {
        $('#ws-recorder-modal').remove();

        const wsApi = new mw.Api();
        const detectedIndex = await detectIndexPage(wsApi);
        const defaultFileName = `Ta-விக்கிமூலம்-${cleanTitle.replace(/[\/\\:*?"<>|]/g, '_')}.ogg`;

        const modalHtml = `
            <div id="ws-recorder-modal" style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.65); z-index:10000; display:flex; align-items:center; justify-content:center; font-family:sans-serif;">
                <div style="background:#fff; padding:22px; border-radius:10px; width:460px; max-width:94%; box-shadow:0 6px 20px rgba(0,0,0,0.35);">
                    <h3 style="margin-top:0; color:#006699; border-bottom:1px solid #ddd; padding-bottom:8px;">
                        🎙️ விக்கிமூல ஒலிநூல் பதிவுக் கருவி
                    </h3>
                    
                    <div style="margin-bottom:10px; text-align:left; font-size:13px;">
                        <label style="font-weight:bold; display:block; margin-bottom:4px;">இணைக்க வேண்டிய அட்டவணைப் பக்கம் (Index Page):</label>
                        <input type="text" id="ws-target-index" value="${mw.html.escape(detectedIndex)}" style="width:100%; padding:6px 8px; border:1px solid #ccc; border-radius:4px; box-sizing:border-box;">
                    </div>

                    <div style="margin-bottom:12px; text-align:left; font-size:13px;">
                        <label style="font-weight:bold; display:block; margin-bottom:4px;">பொதுவகக் கோப்புப் பெயர் (Commons Filename):</label>
                        <input type="text" id="ws-target-filename" value="${mw.html.escape(defaultFileName)}" style="width:100%; padding:6px 8px; border:1px solid #ccc; border-radius:4px; box-sizing:border-box;">
                    </div>

                    <div style="background:#f8f9fa; padding:12px; border-radius:6px; text-align:center; margin-bottom:12px;">
                        <button id="ws-btn-start" style="padding:8px 16px; background:#28a745; color:#fff; border:none; border-radius:5px; cursor:pointer; font-weight:bold;">▶️ வாசிப்பைப் பதிவு செய்</button>
                        <button id="ws-btn-stop" style="padding:8px 16px; background:#dc3545; color:#fff; border:none; border-radius:5px; cursor:pointer; font-weight:bold; display:none;">⏹️ பதிவை நிறுத்து</button>
                        <div id="ws-rec-timer" style="margin-top:6px; font-size:12px; color:#555;">தயார் நிலையில் உள்ளது</div>
                        <audio id="ws-rec-preview" controls style="display:none; width:100%; margin-top:10px;"></audio>
                    </div>

                    <div id="ws-rec-status" style="margin-bottom:12px; font-size:12.5px; font-weight:bold; text-align:center;"></div>

                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <button id="ws-btn-cancel" style="padding:7px 14px; background:#6c757d; color:#fff; border:none; border-radius:5px; cursor:pointer;">மூடு</button>
                        <button id="ws-btn-upload" style="padding:7px 16px; background:#006699; color:#fff; border:none; border-radius:5px; cursor:pointer; font-weight:bold; display:none;">☁️ பொதுவகத்தில் பதிவேற்றி அட்டவணையில் இணை</button>
                    </div>
                </div>
            </div>`;

        $('body').append(modalHtml);

        $('#ws-btn-start').on('click', async function () {
            try {
                streamRef = await navigator.mediaDevices.getUserMedia({ audio: true });
                mediaRecorder = new MediaRecorder(streamRef);
                audioChunks = [];

                mediaRecorder.ondataavailable = e => {
                    if (e.data.size > 0) audioChunks.push(e.data);
                };

                mediaRecorder.onstop = () => {
                    recordedBlob = new Blob(audioChunks, { type: 'audio/ogg; codecs=opus' });
                    const url = URL.createObjectURL(recordedBlob);
                    $('#ws-rec-preview').attr('src', url).show();
                    $('#ws-btn-upload').show();
                    $('#ws-rec-timer').text('ஒலிப்பதிவு நிறைவடைந்தது. கேட்டுச் சரிபார்க்கவும்.').css('color', 'green');
                    if (streamRef) {
                        streamRef.getTracks().forEach(track => track.stop());
                    }
                };

                mediaRecorder.start();
                $(this).hide();
                $('#ws-btn-stop').show();
                $('#ws-rec-timer').text('🔴 ஒலிப்பதிவு நடைபெறுகிறது... தெளிவாக வாசிக்கவும்.').css('color', '#d9534f');
            } catch (err) {
                alert('ஒலிவாங்கி (Microphone) அனுமதியை உலாவியில் வழங்கவும்.');
            }
        });

        $('#ws-btn-stop').on('click', function () {
            if (mediaRecorder && mediaRecorder.state !== 'inactive') {
                mediaRecorder.stop();
            }
            $(this).hide();
            $('#ws-btn-start').show().text('🔄 மீண்டும் பதிவு செய்');
        });

        $('#ws-btn-cancel').on('click', function () {
            if (streamRef) {
                streamRef.getTracks().forEach(track => track.stop());
            }
            $('#ws-recorder-modal').remove();
        });

        $('#ws-btn-upload').on('click', async function () {
            const indexPageTitle = $('#ws-target-index').val().trim();
            const fileName = $('#ws-target-filename').val().trim();

            if (!recordedBlob || !fileName || !indexPageTitle) {
                alert('அட்டவணைப் பக்கம் மற்றும் கோப்புப் பெயரைச் சரிபார்க்கவும்.');
                return;
            }

            const $btn = $(this);
            $btn.prop('disabled', true).text('பதிவேற்றப்படுகிறது...');
            $('#ws-rec-status').text('1/2: விக்கிப் பொதுவகத்தில் ஒலிப்புக் கோப்பு பதிவேற்றப்படுகிறது...').css('color', '#006699');

            const uploadOk = await uploadAudioToCommons(fileName, recordedBlob, indexPageTitle);
            if (!uploadOk) {
                $('#ws-rec-status').text('❌ விக்கிப் பொதுவகப் பதிவேற்றத்தில் பிழை ஏற்பட்டது.').css('color', 'red');
                $btn.prop('disabled', false).text('☁️ மீண்டும் முயற்சி செய்');
                return;
            }

            $('#ws-rec-status').text('2/2: அட்டவணைப் பக்கத்தில் ஒலிப்புக் கோப்பு இணைக்கப்படுகிறது...').css('color', '#006699');
            const linkOk = await linkAudioToIndexPage(wsApi, indexPageTitle, fileName);

            if (linkOk.success) {
                $('#ws-rec-status').html(`✅ வெற்றி! கோப்பு பதிவேற்றப்பட்டு <b>${mw.html.escape(indexPageTitle)}</b> பக்கத்துடன் இணைக்கப்பட்டது.`).css('color', 'green');
                setTimeout(() => {
                    $('#ws-recorder-modal').remove();
                    if (fullTitle === indexPageTitle) location.reload();
                }, 1500);
            } else {
                $('#ws-rec-status').text('❌ அட்டவணை இணைப்பில் பிழை: ' + linkOk.reason).css('color', 'red');
                $btn.prop('disabled', false).text('☁️ மீண்டும் முயற்சி செய்');
            }
        });
    }

    // 4. விக்கிப் பொதுவகத்தில் (Wikimedia Commons) பதிவேற்றுதல்
    async function uploadAudioToCommons(fileName, fileBlob, indexPageTitle) {
        const userName = mw.config.get('wgUserName') || 'Neyakkoo';
        const today = new Date().toISOString().split('T')[0];

        const descriptionText =
            `== {{int:filedesc}} ==\n` +
            `{{Information\n` +
            `|description={{ta|1=தமிழ் விக்கிமூல நூல் வாசிப்பு: [[:s:ta:${indexPageTitle}|${cleanTitle}]]}}\n` +
            `|date=${today}\n` +
            `|source={{own}}\n` +
            `|author=[[User:${userName}|${userName}]]\n` +
            `}}\n\n` +
            `== {{int:license-header}} ==\n` +
            `{{CC-BY-SA-4.0}}\n\n` +
            `[[Category:Tamil Wikisource audio books]]\n` +
            `[[Category:Spoken Tamil]]`;

        try {
            const commonsApi = new mw.ForeignApi('https://commons.wikimedia.org/w/api.php');
            const res = await commonsApi.postWithEditToken({
                action: 'upload',
                filename: fileName,
                file: fileBlob,
                comment: `தமிழ் விக்கிமூல ஒலிநூல் பதிவேற்றம்: [[:s:ta:${indexPageTitle}]]`,
                text: descriptionText,
                ignorewarnings: 1,
                format: 'json'
            });

            return res && res.upload && res.upload.result === 'Success';
        } catch (e) {
            console.error('Commons Upload Error:', e);
            return false;
        }
    }

    // 5. அட்டவணைப் (Index) பக்கத்தில் ஒலிப்புக் கோப்பை இணைத்தல்
    async function linkAudioToIndexPage(wsApi, indexPageTitle, fileName) {
        try {
            const data = await wsApi.get({
                action: 'query',
                prop: 'revisions',
                rvprop: 'content',
                titles: indexPageTitle,
                formatversion: 2
            });

            const page = data && data.query && data.query.pages && data.query.pages[0];
            if (!page || page.missing) {
                return { success: false, reason: 'குறிப்பிட்ட அட்டவணைப் பக்கம் விக்கிமூலத்தில் இல்லை.' };
            }

            let content = page.revisions[0].content;

            if (content.includes(fileName)) {
                return { success: true };
            }

            const audioEntry = `\n* [[File:${fileName}|ஒலிநூல் வாசிப்பு (${cleanTitle})]]`;

            // அட்டவணை வார்ப்புருவில் (Index Template) 'குறிப்புகள்' அல்லது 'Remarks' அளவுரு இருந்தால் அதில் இணைத்தல்
            if (/(\|\s*(?:குறிப்புகள்|Remarks)\s*=)/i.test(content)) {
                content = content.replace(/(\|\s*(?:குறிப்புகள்|Remarks)\s*=)/i, `$1${audioEntry}`);
            } else if (content.includes('== ஒலிநூல் ==')) {
                content = content.replace('== ஒலிநூல் ==', `== ஒலிநூல் ==${audioEntry}`);
            } else {
                content = content.trim() + `\n\n== ஒலிநூல் ==${audioEntry}\n`;
            }

            await wsApi.postWithToken('csrf', {
                action: 'edit',
                title: indexPageTitle,
                text: content,
                summary: `விக்கிப் பொதுவகத்திலிருந்து ஒலிநூல் கோப்பு இணைக்கப்பட்டது: [[File:${fileName}]]`
            });

            return { success: true };
        } catch (err) {
            return { success: false, reason: err.message || err };
        }
    }

    mw.loader.using(['mediawiki.api', 'mediawiki.ForeignApi', 'jquery'], function () {
        $(document).ready(addRecordButton);
    });
})();
