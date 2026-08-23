"""PROTOTYPE - throwaway. Long dictation corpus for openstream issue #67.

Each sample is `messy`: what long-form dictation looks like coming out of the
transcription model server before rules cleanup - run-on, fillers, stutters,
sparse punctuation. That is the real input, because break placement runs on
rules-cleaned text and rules cleanup runs on whisper output.

`reference` (filled in reference.py) is the spike author's own paragraphing,
used only for an automated agreement number. It is NOT the human judgement the
ticket asks for - that comes from a person driving out/review.html.

arch-1 and onboard-1 are para-1 and para-2 from the #24 spike, carried over so
the 130-word bucket is directly comparable to the 4.58s full-rewrite figure.
"""

SAMPLES = [
    # --- ~130 words: the bucket #24 measured, where the 0.39s headroom is ---
    dict(id="arch-1", bucket="130", messy=(
        "here's where I've landed on the architecture question the the main thing "
        "is that we've got two subprocesses to supervise and that's already kind of "
        "a lot for a menu bar app whisper is unavoidable obviously we need it but "
        "the llama server is the one I keep going back and forth on because it holds "
        "two gigs of ram resident the whole time the app is running and I'm not sure "
        "that's a trade people want to make just for slightly nicer punctuation so "
        "what I'd like to do is measure it properly before we commit and if the "
        "rules based thing gets us eighty percent of the way there then honestly we "
        "should just ship that and revisit later"
    )),
    dict(id="onboard-1", bucket="130", messy=(
        "the onboarding flow needs to handle three separate permission prompts and "
        "they all behave differently which is annoying microphone access is the "
        "standard one that pops a system dialog immediately accessibility is the one "
        "where macos just silently denies you until the user goes into system "
        "settings and flips the toggle manually and then input monitoring is the one "
        "nobody remembers exists until the global hotkey doesn't fire what I think we "
        "should do is detect all three up front on first launch show a single "
        "checklist screen with a green tick next to each one as it gets granted and "
        "just poll every second or so to update it because there's no callback for "
        "the accessibility one anyway"
    )),
    dict(id="bug-1", bucket="130", messy=(
        "um so I finally tracked down the the hotkey bug and it's not what we thought "
        "at all the event tap is fine it's registering correctly every time what's "
        "happening is that macos silently disables the tap when the callback takes "
        "too long and our callback was doing the whole transcription kickoff "
        "synchronously so on a cold start where the model hasn't loaded yet we blow "
        "past the timeout and the system just quietly kills our tap the fix is "
        "straightforward we move everything out of the callback and post to a "
        "queue immediately so the callback returns in microseconds but we also need "
        "to listen for the tap disabled notification and re-enable it because there "
        "are other ways to trip it that we don't control"
    )),
    dict(id="review-1", bucket="130", messy=(
        "I went through the pull request and mostly it looks good but there are two "
        "things I want to flag before it goes in the first is that the supervisor is "
        "swallowing the exit code when a model server dies which means a crash and a "
        "clean shutdown look identical in the logs and we will regret that the very "
        "first time somebody reports a hang the second thing is more of a taste "
        "question the retry loop backs off exponentially up to thirty seconds which "
        "is fine for a network call but this is a local process that either starts or "
        "doesn't so I'd rather it fail fast and surface an error than sit there "
        "retrying quietly for half a minute"
    )),

    # --- ~200 words ---
    dict(id="plan-1", bucket="200", messy=(
        "okay so thinking about what we actually commit to for the next two weeks I "
        "think there are three buckets of work and they're not equally risky the "
        "first bucket is the stuff we've already measured which is the transcription "
        "path and the rules cleanup that's basically de-risked at this point we know "
        "the numbers we know it fits the budget it's just implementation the second "
        "bucket is the accessibility integration which is annoying but bounded we "
        "know what the api gives us we've prototyped the probe we just have to grind "
        "through the per app quirks and there will be more of those than we expect "
        "there always are the third bucket is the one that worries me which is "
        "anything involving the rewrite model server because every question there is "
        "still open which model how big does it fit in memory alongside whisper does "
        "it actually do the job and we've been assuming answers to all four so what "
        "I'd propose is we take the first two buckets as the committed scope and we "
        "timebox a spike on the third one to about three days and if the spike comes "
        "back badly we cut the feature for v zero rather than letting it eat the "
        "whole cycle"
    )),
    dict(id="incident-1", bucket="200", messy=(
        "so let me walk through what actually happened yesterday because the timeline "
        "matters more than the fix at about two in the afternoon we started seeing "
        "the app pin a full core on machines that had been idle for hours not doing "
        "anything just sitting there burning cpu and battery the first reports came "
        "from the two people on eight gig machines which turned out to be the clue "
        "what was going on is that the model supervisor was releasing the rewrite "
        "server after five minutes idle exactly as designed but the release path "
        "wasn't waiting for the process to actually exit before the next request "
        "could come in so you'd get a release and a start racing each other and under "
        "memory pressure the release takes long enough that the race is basically "
        "guaranteed the immediate fix is a lock around the lifecycle transitions "
        "which I've already pushed but the deeper lesson is that we have three "
        "different places that can start or stop a model server and that's two too "
        "many so I want to fold all of them into the supervisor and make it the only "
        "thing that touches process lifecycle"
    )),
    dict(id="design-1", bucket="200", messy=(
        "I've been sketching the menu bar interaction and I keep coming back to the "
        "idea that the app should be almost invisible in normal use the whole pitch "
        "is you hold a key you talk you let go and the words are there so any ui we "
        "put in front of that is friction the only thing that genuinely needs to be "
        "visible while you're speaking is some indication that we're actually "
        "listening because otherwise you talk for thirty seconds into a void and "
        "discover the hotkey didn't fire so I'm thinking a very small floating "
        "indicator near the cursor not a window not a panel just a dot that pulses "
        "while the mic is hot and then for everything else settings permissions model "
        "choice history that all lives behind the menu bar icon where you go "
        "deliberately when you want it the thing I'm least sure about is what happens "
        "when transcription fails or takes too long because right now the design just "
        "assumes it works and I don't have a good answer for the case where you "
        "spoke for a minute and something went wrong"
    )),
    dict(id="hiring-1", bucket="200", messy=(
        "quick debrief on the candidate from this morning overall I'd lean yes but "
        "with a caveat the technical part was genuinely strong they worked through "
        "the concurrency problem without much prompting and more importantly when I "
        "pushed back on their first approach they actually reconsidered it rather "
        "than defending it which is the thing I care about most in that exercise "
        "where I'm less sure is the systems side when we got into how they'd "
        "structure the process supervision the answers got noticeably vaguer and "
        "there was a moment where they conflated a thread and a process which for a "
        "role that is mostly about wrangling native subprocesses is a real gap that "
        "said they've clearly never worked on desktop software before and everything "
        "they have worked on they seem to know deeply so I read it as inexperience "
        "rather than as a ceiling my recommendation would be hire but pair them with "
        "someone on the supervisor work for the first month rather than handing them "
        "that area outright"
    )),

    # --- ~300 words: where breaks matter most and prefill costs most ---
    dict(id="migration-1", bucket="300", messy=(
        "let me lay out the migration plan because I think we've been talking past "
        "each other on the sequencing the current situation is that settings live in "
        "a json file that we read on launch and write on every change which was fine "
        "when there were four settings and is now genuinely a problem because we're "
        "up to about forty and we've started storing things that aren't really "
        "settings like the vocabulary cache and the per app break safe list the "
        "immediate pain is that a partial write corrupts the whole file and we've had "
        "two reports of exactly that where somebody force quit during a write and "
        "lost all their configuration so the destination is obviously sqlite one file "
        "atomic writes real transactions nothing exotic the part that needs care is "
        "how we get from here to there without breaking anyone who upgrades what I'd "
        "propose is three stages the first stage is we ship the sqlite store "
        "alongside the json file and write to both reading only from json so if "
        "anything is wrong with the new path nobody notices and we can look at real "
        "data from real installs the second stage a release later is we flip the read "
        "to sqlite and keep writing both so a downgrade still works and if we've got "
        "the migration wrong the fix is a one line revert rather than a data recovery "
        "exercise the third stage is we stop writing json and delete the shim and "
        "that's the point of no return so it should be at least two releases after "
        "the second stage the thing I want to avoid is the version of this where we "
        "do it all in one release feel clever about it and then spend a week writing "
        "a recovery tool for the people whose settings vanished"
    )),
    dict(id="perf-1", bucket="300", messy=(
        "so I spent most of yesterday on the startup time problem and the answer is "
        "annoying because it's not one thing it's four things each of which is "
        "individually defensible cold launch to usable is currently about four and a "
        "half seconds which is way past what anyone will tolerate for a menu bar app "
        "the biggest single chunk is electron itself which is roughly one point two "
        "seconds before any of our code runs and there is nothing we can do about "
        "that short of not using electron the second chunk is that we load the "
        "whisper model eagerly on launch which is another one point one seconds and "
        "that one is a real choice we made deliberately so the first dictation is "
        "fast the third chunk is the accessibility permission check which sounds like "
        "it should be instant and is actually about eight hundred milliseconds "
        "because the api call blocks while the system decides whether to show a "
        "dialog and the fourth is our own initialization which is about six hundred "
        "milliseconds mostly spent scanning the git repo for vocabulary my proposal "
        "is that we attack the second and fourth because those are ours the "
        "vocabulary scan absolutely does not need to happen before the ui is "
        "interactive it can happen lazily on first dictation or even in the "
        "background after launch and the whisper load can move behind a splash so the "
        "menu bar icon appears immediately and shows a loading state that gets us to "
        "roughly two seconds to visible which I think is acceptable the "
        "accessibility check I'd just move off the critical path entirely and treat "
        "not yet known as a valid state rather than blocking on it"
    )),
    dict(id="product-1", bucket="300", messy=(
        "I want to push back a little on how we've been framing the product because I "
        "think we're describing it in a way that makes it sound smaller than it is "
        "every time we talk about this externally we lead with local and free and "
        "those are both true and both increasingly unremarkable there are half a "
        "dozen local dictation tools now and the good ones are free so if that's the "
        "pitch we are one of many the thing that is actually different is that we "
        "know what application you're typing into and nobody else does anything with "
        "that even the narrow version of it that we've settled on which is just "
        "knowing whether a line break will submit your message is a real problem that "
        "every other tool gets wrong constantly you dictate a two paragraph message "
        "into slack and half of it sends and that's a bad enough experience that "
        "people just stop dictating anything long so I'd argue the headline should be "
        "something like dictation that doesn't send half your message and then local "
        "and free are supporting points rather than the lead the risk with that "
        "framing is that it commits us to the context detection being genuinely "
        "reliable because if we lead with it and it's flaky we're worse off than if "
        "we'd never mentioned it so it's a framing that we earn by getting the "
        "allow list right rather than one we can adopt today I'd like us to hold it "
        "as the target and revisit once we have real numbers on detection accuracy"
    )),
    dict(id="standup-1", bucket="300", messy=(
        "longer update than usual from me because a few things landed at once first "
        "on the transcription side the resident server change is merged and it's a "
        "much bigger win than I expected we were paying the model load on every "
        "single dictation which is why everything felt sluggish and now that it's "
        "resident the short clips come back in about a tenth of a second which is "
        "genuinely instant from the user's point of view second the rules cleanup is "
        "basically done and I've pulled it out of the spike directory into real code "
        "with tests the only rule I'm still unhappy with is the run on sentence "
        "splitter because it splits on conjunctions and that lands boundaries in the "
        "middle of clauses so you get sentences that start with and which reads badly "
        "I don't have a better deterministic approach yet and I'm reluctant to spend "
        "more time on it until we know whether the model is deciding paragraph breaks "
        "anyway because that might make the whole question moot third I've started on "
        "the accessibility helper and hit the thing everyone warned me about which is "
        "that the permission is granted to the binary that launches you so during "
        "development you're granting it to your terminal and not to the app and the "
        "state you observe is basically meaningless unless you launch the built app "
        "the way a user would I've written that up in the spike notes because it cost "
        "me an afternoon and will cost the next person the same what's blocked is the "
        "model server work which is waiting on the spike results and I'd rather not "
        "start it until we know which model we're targeting"
    )),
]
