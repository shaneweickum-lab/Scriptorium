import { useState } from 'react';
import { X, ChevronRight, ChevronLeft, Sparkles } from 'lucide-react';
import { useWriterProfileStore } from '../../store/writerProfileStore';

interface Props {
  onClose: () => void;
}

const GENRES = ['Fantasy', 'Sci-Fi', 'Romance', 'Mystery', 'Horror', 'Adventure', 'Historical Fiction', 'Thriller', 'Contemporary', 'Poetry'];
const HOBBIES = ['Gaming', 'Drawing', 'Reading', 'Sports', 'Music', 'Cooking', 'Coding', 'Hiking', 'Photography', 'Film'];
const GOALS = [
  'Improve my grammar',
  'Write better stories',
  'Build stronger characters',
  'Get better at description',
  'Write faster',
  'Prepare for a class or exam',
];

export function WriterOnboardingModal({ onClose }: Props) {
  const { updateAge, updateInterests, setOnboardingComplete } = useWriterProfileStore();

  const [step, setStep] = useState(0);
  const [age, setAge] = useState('');
  const [grade, setGrade] = useState('');
  const [genres, setGenres] = useState<string[]>([]);
  const [hobbies, setHobbies] = useState<string[]>([]);
  const [favoriteStory, setFavoriteStory] = useState('');
  const [goal, setGoal] = useState('');

  const STEPS = ['About You', 'Your Interests', 'Your Goal'];

  function toggleGenre(g: string) {
    setGenres((prev) => prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]);
  }
  function toggleHobby(h: string) {
    setHobbies((prev) => prev.includes(h) ? prev.filter((x) => x !== h) : [...prev, h]);
  }

  function handleNext() {
    if (step < STEPS.length - 1) {
      setStep((s) => s + 1);
    } else {
      // Save
      const ageNum = parseInt(age);
      const gradeNum = parseInt(grade);
      if (!isNaN(ageNum)) updateAge(ageNum, isNaN(gradeNum) ? undefined : gradeNum);
      updateInterests({
        favoriteGenres: genres,
        hobbies,
        favoriteStory: favoriteStory.trim() || undefined,
        writingGoal: goal || undefined,
      });
      setOnboardingComplete();
      onClose();
    }
  }

  const canProceed =
    step === 0 ? age.trim() !== '' :
    step === 1 ? genres.length > 0 :
    true;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="p-6 pb-4 border-b border-slate-100">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, #7c3aed, #0d9488)' }}>
                <Sparkles size={15} className="text-white" />
              </div>
              <span className="font-semibold text-slate-800">Meet Your Writing Coach</span>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
              <X size={16} />
            </button>
          </div>

          {/* Step indicator */}
          <div className="flex gap-2">
            {STEPS.map((s, i) => (
              <div key={s} className="flex-1">
                <div className={`h-1 rounded-full transition-colors ${i <= step ? 'bg-violet-500' : 'bg-slate-200'}`} />
                <p className={`text-[10px] mt-1 ${i === step ? 'text-violet-600 font-medium' : 'text-slate-400'}`}>{s}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="p-6 min-h-[320px]">
          {step === 0 && (
            <div className="space-y-5">
              <div>
                <p className="text-slate-700 font-medium mb-1">Hi there! How old are you?</p>
                <p className="text-xs text-slate-500 mb-3">This helps your coach pitch explanations at the right level.</p>
                <input
                  type="number" min="6" max="99"
                  value={age} onChange={(e) => setAge(e.target.value)}
                  placeholder="Your age"
                  className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-700 focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                />
              </div>
              <div>
                <p className="text-slate-700 font-medium mb-1">What grade are you in? <span className="text-slate-400 font-normal">(optional)</span></p>
                <input
                  type="number" min="1" max="12"
                  value={grade} onChange={(e) => setGrade(e.target.value)}
                  placeholder="Grade 1–12 (leave blank if you're in college or older)"
                  className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-700 focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                />
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-5">
              <div>
                <p className="text-slate-700 font-medium mb-1">What genres do you love? <span className="text-slate-400 text-xs">(pick at least one)</span></p>
                <div className="flex flex-wrap gap-2 mt-2">
                  {GENRES.map((g) => (
                    <button key={g} onClick={() => toggleGenre(g)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${genres.includes(g) ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-slate-600 border-slate-200 hover:border-violet-300'}`}>
                      {g}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-slate-700 font-medium mb-1">Any hobbies or interests? <span className="text-slate-400 font-normal text-xs">(optional)</span></p>
                <div className="flex flex-wrap gap-2 mt-2">
                  {HOBBIES.map((h) => (
                    <button key={h} onClick={() => toggleHobby(h)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${hobbies.includes(h) ? 'bg-teal-600 text-white border-teal-600' : 'bg-white text-slate-600 border-slate-200 hover:border-teal-300'}`}>
                      {h}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-slate-700 font-medium mb-1">What's your favourite book, show, or game? <span className="text-slate-400 font-normal text-xs">(optional)</span></p>
                <input
                  value={favoriteStory} onChange={(e) => setFavoriteStory(e.target.value)}
                  placeholder="e.g. Harry Potter, Minecraft, Dune..."
                  className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-700 focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                />
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <p className="text-slate-700 font-medium mb-1">What's your main writing goal?</p>
              <p className="text-xs text-slate-500 mb-4">Your coach will keep this in mind during every session.</p>
              <div className="grid grid-cols-1 gap-2">
                {GOALS.map((g) => (
                  <button key={g} onClick={() => setGoal(g)}
                    className={`w-full text-left px-4 py-3 rounded-xl border text-sm transition-all ${goal === g ? 'bg-violet-50 border-violet-400 text-violet-700 font-medium' : 'bg-white border-slate-200 text-slate-600 hover:border-violet-300'}`}>
                    {g}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 flex items-center justify-between">
          {step > 0 ? (
            <button onClick={() => setStep((s) => s - 1)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors">
              <ChevronLeft size={15} /> Back
            </button>
          ) : <div />}

          <button onClick={handleNext} disabled={!canProceed}
            className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-40"
            style={{ background: canProceed ? 'linear-gradient(135deg, #7c3aed, #0d9488)' : '#94a3b8' }}>
            {step < STEPS.length - 1 ? (<>Next <ChevronRight size={15} /></>) : 'Start Coaching'}
          </button>
        </div>
      </div>
    </div>
  );
}
