"""PROTOTYPE - throwaway. List-boundary corpus for openstream issue #125.

Each sample is `messy`: what dictation looks like coming out of the
transcription model server before rules cleanup - run-on, fillers, sparse
punctuation. That is the real input, because the structure call runs on
rules-cleaned text and rules cleanup runs on whisper output.

Groups, by id prefix (see README.md):

  list-*    genuine spoken lists, items as separate clauses  -> recall
  inline-*  genuine lists, items inside ONE sentence         -> the known gap
  decoy-*   ordinal words as a turn of phrase, not a list    -> false positives
  carry-*   lifted from spike/break-position-67/samples.py   -> breaks regression

`reference.py` holds one author's read of the expected structure, used only for
an automated agreement number. The real judgement is a person driving
out/review.html.
"""

SAMPLES = [
    # --- genuine lists, items as separate clauses ------------------------
    dict(id="list-groceries", bucket="130", messy=(
        "okay before I forget I need to sort out the shop for the weekend "
        "we're basically out of everything so the big things are milk we need "
        "the oat one not the dairy one then eggs a dozen should be fine bread "
        "the seeded loaf if they have it and then coffee because we finished "
        "the last of it this morning oh and washing up liquid the sink is a "
        "state honestly I'll go tomorrow morning before it gets busy"
    )),
    dict(id="list-standup", bucket="130", messy=(
        "right so for standup my update is pretty short first thing is I "
        "finished the retry logic on the supervisor that's merged now second "
        "thing I'm halfway through the notarisation fix but I'm blocked on the "
        "apple cert which ops is chasing and the third thing is I want to pick "
        "up the overlay flicker bug next if nobody objects that's me done"
    )),
    dict(id="list-packing", bucket="200", messy=(
        "for the trip next week here's what still needs to go in the bag the "
        "passports obviously both of them the one that expired is in the same "
        "drawer so double check the dates the travel adapter the european one "
        "not the us one the phone chargers all three because the short one "
        "always goes missing sun cream because apparently it's going to be "
        "thirty degrees and the paperback I started because there's a four "
        "hour layover in the middle and nothing to do also I should probably "
        "download some things to watch before we leave the house because the "
        "airport wifi is never worth the login"
    )),

    dict(id="list-deploy-steps", bucket="130", messy=(
        "here is the deploy runbook for the release. bump the version in the "
        "package file and commit that on its own. tag the commit and push the "
        "tag because the workflow triggers on tags not branches. wait for the "
        "notarisation job to go green which takes about ten minutes. then "
        "download the artefact from the release page and check it opens on a "
        "machine that has never seen it before. only then announce it in the "
        "channel. if any step fails stop and shout rather than pushing on."
    )),
    dict(id="list-candidates", bucket="200", messy=(
        "we narrowed the model choice down to three real options and each has "
        "a catch. smol lm two is the provisional pick and it is apache "
        "licensed and ungated which is exactly what we need but it overshoots "
        "the memory assumption by about fourteen percent. quen three is two "
        "hundred megs cheaper in memory and also ungated but its latency is "
        "all over the place and the thinking mode has to be disabled by hand. "
        "the third option is to drop the model entirely and ship rules only "
        "which is free on memory but gives up paragraph breaks and list "
        "detection completely. i think we go with smol lm two but the memory "
        "number needs a proper measurement on a small machine first."
    )),

    # --- genuine lists, items inside ONE sentence (the structural gap) ----
    dict(id="inline-shop", bucket="130", messy=(
        "so I'm heading past the shop on the way back does anyone need "
        "anything I'm going to grab milk eggs bread and some of those "
        "biscuits we had last week and I think that's it unless you can think "
        "of something we should probably also get more coffee actually no "
        "there's a bag in the cupboard behind the mugs it's fine"
    )),
    dict(id="inline-agenda", bucket="130", messy=(
        "the meeting tomorrow should be quick the agenda is really just the "
        "budget the hiring plan and the office move nothing controversial in "
        "any of them I'll send the deck round tonight so people can read it "
        "first and we can keep the actual call to half an hour"
    )),

    # --- ordinal words as a turn of phrase, NOT a list -------------------
    dict(id="decoy-thanks", bucket="130", messy=(
        "before we wrap up I just want to say a couple of things first of all "
        "genuinely thank you all for the push this week I know it was a lot "
        "and secondly the demo went really well the client was happy so that "
        "pressure is off now let's all take the weekend properly and come back "
        "fresh on monday there's no fire that can't wait"
    )),
    dict(id="decoy-argument", bucket="200", messy=(
        "I've been thinking about whether we should even keep the llama server "
        "resident and honestly I keep going back and forth first of all it's "
        "two gigs of ram which on an eight gig machine is a quarter of "
        "everything just gone but then again the break placement genuinely "
        "does need it there and starting it lazily adds a second of latency to "
        "the first dictation which is exactly when people are judging whether "
        "the app is any good so on balance I think it stays resident but I "
        "want us to measure the memory properly on a small machine before we "
        "commit to that in the release notes"
    )),
    dict(id="decoy-story", bucket="130", messy=(
        "the hotkey bug was such a saga first it looked like an event tap "
        "problem then it looked like a permissions thing then finally we "
        "worked out macos was killing the tap because our callback was too "
        "slow so the fix in the end was tiny just move the work off the "
        "callback thread but it took three days to find one line"
    )),

    # --- carried from spike/break-position-67, breaks-dimension check ----
    dict(id="carry-arch-1", bucket="130", messy=(
        "here's where I've landed on the architecture question the the main "
        "thing is that we've got two subprocesses to supervise and that's "
        "already kind of a lot for a menu bar app whisper is unavoidable "
        "obviously we need it but the llama server is the one I keep going "
        "back and forth on because it holds two gigs of ram resident the "
        "whole time the app is running and I'm not sure that's a trade people "
        "want to make just for slightly nicer punctuation so what I'd like to "
        "do is measure it properly before we commit and if the rules based "
        "thing gets us eighty percent of the way there then honestly we "
        "should just ship that and revisit later"
    )),
    dict(id="carry-onboard-1", bucket="130", messy=(
        "the onboarding flow needs to handle three separate permission "
        "prompts and they all behave differently which is annoying microphone "
        "access is the standard one that pops a system dialog immediately "
        "accessibility is the one where macos just silently denies you until "
        "the user goes into system settings and flips the toggle manually and "
        "then input monitoring is the one nobody remembers exists until the "
        "global hotkey doesn't fire what I think we should do is detect all "
        "three up front on first launch show a single checklist screen with a "
        "green tick next to each one as it gets granted and just poll every "
        "second or so to update it because there's no callback for the "
        "accessibility one anyway"
    )),
]
