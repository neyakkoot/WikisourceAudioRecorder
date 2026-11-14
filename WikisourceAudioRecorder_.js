// ============================================================
// Wikisource Page Audio Recorder & Page Linker
// தமிழ் விக்கிமூல நூலின் ஒவ்வொரு பக்கத்தையும் (Page: Namespace 104)
// வாசித்துப் பதிவு செய்து விக்கிப் பொதுவகத்தில் பதிவேற்றி,
// அந்தக் குறிப்பிட்ட பக்கத்திலேயே ஒலிப்புக் கோப்பை இணைக்கும் கருவி
// Author: Dr. Sathiyaraj Thangasamy (Neyakkoo)
// ============================================================

(function () {
    'use strict';

    const ns = mw.config.get('wgNamespaceNumber');
    // நூலின் ஒவ்வொரு பக்கத்திலும் (பக்கம்: / Page: Namespace 104) மட்டுமே இயங்கும்
    if (ns !== 104) return;

    const fullPageName = mw.config.get('wgPageName'); // எ.கா: பக்கம்:அறிவுக்_கதைகள்.pdf/11
    const cleanTitle   = mw.config.get('wgTitle');    // எ.கா: அறிவுக் கதைகள்.pdf/11
    const SCRIPT_RE    = /[\u0B80-\u0BFF]/;

    if (!SCRIPT_RE.test(cleanTitle)) return;

    let mediaRecorder = null;
    let audioChunks   = [];
    let recordedBlob  = null;
    let streamRef     = null;

    // 1. பக்கத்தின் தலைப்பிற்கு அருகில் பொத்தானைச் சேர்த்தல்
    function addPageRecordButton() {
        if ($('#ws-page-audio-btn').length > 0) return;

        const btn = $('<button>', {
            id: 'ws-page-audio-btn',
            type: 'button',
            title: 'இப்பக்கத்தை வாசித்து ஒலிப்பதிவு செய்து இப்பக்கத்திலேயே இணை'
        })
        .html('🎙️ <b>இப்பக்கத்தை ஒலிப்பதிவு செய்</b>')
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
        .on('click', openPageRecorderModal);

        if ($('#firstHeading').length) {
            $('#firstHeading').append(btn);
        } else {
            $('#mw-content-text').before(btn);
        }
    }

    // 2. கோப்புப் பெயரைத் துல்லியமாக உருவாக்குதல் (நூல் பெயர் + பக்க எண்)
    function buildPageAudioFilename() {
        // 'அறிவுக் கதைகள்.pdf/11' -> நூல்: 'அறிவுக்_கதைகள்.pdf', பக்கம்: '11'
        let bookPart = cleanTitle;
        let pageNum  = '';

        if (cleanTitle.includes('/')) {
            const parts = cleanTitle.split('/');
            pageNum  = parts.pop();
            bookPart = parts.join('_');
        }

        const safeBook = bookPart.replace(/[\/\\:*?"<>|\s]+/g, '_');
        return pageNum
            ? `Ta-விக்கிமூலம்-${safeBook}-பக்கம்-${pageNum}.ogg`
            : `Ta-விக்கிமூலம்-${safeBook}.ogg`;
    }

    // 3. ஒலிப்பதிவு முகப்புப் பெட்டி (Modal UI)
    function openPageRecorderModal() {
        $('#ws-page-recorder-modal').remove();

        const defaultFileName = buildPageAudioFilename();
        const displayPageName = fullPageName.replace(/_/g, ' ');

        const modalHtml = `
            <div id="ws-page-recorder-modal" style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.65); z-index:10000; display:flex; align-items:center; justify-content:center; font-family:sans-serif;">
                <div style="background:#fff; padding:22px; border-radius:10px; width:470px; max-width:94%; box-shadow:0 6px 20px rgba(0,0,0,0.35);">
                    <h3 style="margin-top:0; color:#006699; border-bottom:1px solid #ddd; padding-bottom:8px;">
                        🎙️ பக்க ஒலிப்பதிவுக் கருவி
                    </h3>

                    <div style="margin-bottom:10px; text-align:left; font-size:13px;">
                        <label style="font-weight:bold; display:block; margin-bottom:4px;">இணைக்கப்படும் விக்கிமூலப் பக்கம்:</label>
                        <input type="text" id="ws-target-page" value="${mw.html.escape(displayPageName)}" readonly style="width:100%; padding:6px 8px; border:1px solid #ccc; border-radius:4px; background:#f2f4f7; box-sizing:border-box;">
                    </div>

                    <div style="margin-bottom:12px; text-align:left; font-size:13px;">
                        <label style="font-weight:bold; display:block; margin-bottom:4px;">விக்கிப் பொதுவகக் கோப்புப் பெயர்:</label>
                        <input type="text" id="ws-target-filename" value="${mw.html.escape(defaultFileName)}" style="width:100%; padding:6px 8px; border:1px solid #ccc; border-radius:4px; box-sizing:border-box;">
                    </div>

                    <div style="background:#f8f9fa; padding:14px; border-radius:6px; text-align:center; margin-bottom:12px; border:1px solid #e1e4e8;">
                        <button id="ws-btn-start" style="padding:8px 16px; background:#28a745; color:#fff; border:none; border-radius:5px; cursor:pointer; font-weight:bold;">▶️ வாசிப்பைப் பதிவு செய்</button>
                        <button id="ws-btn-stop" style="padding:8px 16px; background:#dc3545; color:#fff; border:none; border-radius:5px; cursor:pointer; font-weight:bold; display:none;">⏹️ பதிவை நிறுத்து</button>
                        <div id="ws-rec-timer" style="margin-top:8px; font-size:12px; color:#555;">இப்பக்கத்தின் உரையை வாசிக்கத் தயாராக உள்ளது</div>
                        <audio id="ws-rec-preview" controls style="display:none; width:100%; margin-top:10px;"></audio>
                    </div>

                    <div id="ws-rec-status" style="margin-bottom:12px; font-size:12.5px; font-weight:bold; text-align:center;"></div>

                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <button id="ws-btn-cancel" style="padding:7px 14px; background:#6c757d; color:#fff; border:none; border-radius:5px; cursor:pointer;">மூடு</button>
                        <button id="ws-btn-upload" style="padding:7px 16px; background:#006699; color:#fff; border:none; border-radius:5px; cursor:pointer; font-weight:bold; display:none;">☁️ பொதுவகத்தில் பதிவேற்றி இப்பக்கத்தில் இணை</button>
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
                    $('#ws-rec-timer').text('ஒலிப்பதிவு முடிந்தது. கேட்டுச் சரிபார்த்துப் பதிவேற்றவும்.').css('color', 'green');
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
            $('#ws-page-recorder-modal').remove();
        });

        $('#ws-btn-upload').on('click', async function () {
            const targetPage = $('#ws-target-page').val().trim();
            const fileName   = $('#ws-target-filename').val().trim();

            if (!recordedBlob || !fileName || !targetPage) {
                alert('பக்கம் மற்றும் கோப்புப் பெயரைச் சரிபார்க்கவும்.');
                return;
            }

            const $btn = $(this);
            $btn.prop('disabled', true).text('பதிவேற்றப்படுகிறது...');
            $('#ws-rec-status').text('1/2: விக்கிப் பொதுவகத்தில் ஒலிப்புக் கோப்பு பதிவேற்றப்படுகிறது...').css('color', '#006699');

            const uploadOk = await uploadPageAudioToCommons(fileName, recordedBlob, targetPage);
            if (!uploadOk) {
                $('#ws-rec-status').text('❌ விக்கிப் பொதுவகப் பதிவேற்றத்தில் பிழை ஏற்பட்டது.').css('color', 'red');
                $btn.prop('disabled', false).text('☁️ மீண்டும் முயற்சி செய்');
                return;
            }

            $('#ws-rec-status').text('2/2: இப்பக்கத்தில் ஒலிப்புக் கோப்பு இணைக்கப்படுகிறது...').css('color', '#006699');
            const linkOk = await linkAudioToCurrentPage(targetPage, fileName);

            if (linkOk.success) {
                $('#ws-rec-status').html(`✅ வெற்றி! ஒலிப்புக் கோப்பு பதிவேற்றப்பட்டு இப்பக்கத்தில் இணைக்கப்பட்டது.`).css('color', 'green');
                setTimeout(() => {
                    $('#ws-page-recorder-modal').remove();
                    location.reload();
                }, 1200);
            } else {
                $('#ws-rec-status').text('❌ பக்கத்தில் இணைப்பதில் பிழை: ' + linkOk.reason).css('color', 'red');
                $btn.prop('disabled', false).text('☁️ மீண்டும் முயற்சி செய்');
            }
        });
    }

    // 4. விக்கிப் பொதுவகத்தில் பதிவேற்றுதல்
    async function uploadPageAudioToCommons(fileName, fileBlob, targetPage) {
        const userName = mw.config.get('wgUserName') || 'Neyakkoo';
        const today    = new Date().toISOString().split('T')[0];

        const descriptionText =
            `== {{int:filedesc}} ==\n` +
            `{{Information\n` +
            `|description={{ta|1=தமிழ் விக்கிமூலப் பக்க வாசிப்பு: [[:s:ta:${targetPage}|${targetPage}]]}}\n` +
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
                comment: `தமிழ் விக்கிமூலப் பக்க ஒலிப்பதிவு: [[:s:ta:${targetPage}]]`,
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

    // 5. குறிப்பிட்ட பக்கத்தின் (Page: Namespace) உள்ளடக்கத்தில் ஒலிப்புக் கோப்பை இணைத்தல்
    async function linkAudioToCurrentPage(pageTitle, fileName) {
        const wsApi = new mw.Api();
        try {
            const data = await wsApi.get({
                action: 'query',
                prop: 'revisions',
                rvprop: 'content',
                titles: pageTitle,
                formatversion: 2
            });

            const page = data && data.query && data.query.pages && data.query.pages[0];
            if (!page || page.missing) {
                return { success: false, reason: 'பக்கம் கண்டறியப்படவில்லை.' };
            }

            let content = page.revisions[0].content;

            if (content.includes(fileName)) {
                return { success: true };
            }

            // ProofreadPage (<noinclude>...</noinclude>) அமைப்பிற்கு ஏற்ப ஒலிப்புக் கோப்பை இணைத்தல்
            const audioWikitext = `<noinclude>{{ஒலிக்கோப்பு|${fileName}}} [[File:${fileName}|ஒலிப்பு]]</noinclude>\n`;

            // ஏற்கனவே மேலே <noinclude> தலைப்புப் பகுதி இருந்தால் அதற்குள் சேர்த்தல்
            if (/^<noinclude>/i.test(content.trim())) {
                content = content.trim().replace(/^<noinclude>/i, `<noinclude>{{ஒலிக்கோப்பு|${fileName}}} [[File:${fileName}|ஒலிப்பு]]\n`);
            } else {
                content = audioWikitext + content;
            }

            await wsApi.postWithToken('csrf', {
                action: 'edit',
                title: pageTitle,
                text: content,
                summary: `விக்கிப் பொதுவகத்திலிருந்து இப்பக்கத்திற்கான ஒலிப்புக் கோப்பு இணைக்கப்பட்டது: [[File:${fileName}]]`
            });

            return { success: true };
        } catch (err) {
            return { success: false, reason: err.message || err };
        }
    }

    // ProofreadPage பக்கங்கள் முழுமையாக ஏற்றப்பட்டவுடன் பொத்தானைக் காட்டுதல்
    mw.loader.using(['mediawiki.api', 'mediawiki.ForeignApi', 'jquery'], function () {
        $(document).ready(addPageRecordButton);
        mw.hook('wikipage.content').add(addPageRecordButton);
    });
})();
